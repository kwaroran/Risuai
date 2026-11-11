import { language } from "src/lang"
import { get } from "svelte/store"
import { alertStore } from "./stores.svelte"
import type { alertData } from "./alert"

/**
 * Save watchdog.
 *
 * Saving depends on two things that can silently die:
 *  1. Svelte effects that notice database changes. When an exception aborts a
 *     flush, effects that were dirty but not yet run stay dirty forever and are
 *     never scheduled again, so changes stop reaching the save loop.
 *  2. The save loop itself, which can hang on a storage write that never settles
 *     (Tauri FS, IndexedDB/OPFS, or the node server over the network).
 *
 * The watchdog uses nothing reactive for its own checks, only a plain timer.
 * The notice is a normal error alert; if the alert cannot be rendered because
 * rendering ({#if} blocks) is what broke, it falls back to plain DOM.
 */

type StallKind = 'tracker' | 'reactivity' | 'loop' | 'effectError'

interface WatchdogHooks {
    /** Cheap, non-reactive value that changes whenever the watched save data changes. */
    fingerprint: () => string
    /** Recreates the change tracking effects. */
    restartTracking: () => void
    /** Makes the save loop write the whole database regardless of tracked changes. */
    forceSave: () => void
}

const TICK_MS = 5000
const LOOP_STALL_MS = 90000
const RECOVER_COOLDOWN_MS = 30000

let hooks: WatchdogHooks | null = null
let started = false

//save loop
let lastBeat = 0
let loopStage = 'idle'
let lastSuccess = 0

//change tracking effects
let trackerRuns = 0
let seenRuns = 0
let seenFingerprint = ''
let trackerSuspect = false
let trackerDead = false
let pendingEffectError: { name: string, error: unknown } | null = null

//scheduler probe
let ping = $state(0)
let ackUser = 0
let ackPre = 0
let probeMisses = 0
let probeDead = false
let stopProbe: (() => void) | null = null

let lastTick = 0
let lastRecover = 0
let lastForced = 0
let loopNotified = false

function startProbe() {
    stopProbe?.()
    stopProbe = $effect.root(() => {
        //user effects and render effects are queued separately, so probe both
        $effect(() => {
            ackUser = ping
        })
        $effect.pre(() => {
            ackPre = ping
        })
    })
}

function recover(force: boolean) {
    if (!hooks) {
        return
    }
    const now = Date.now()
    if (!force && now - lastRecover < RECOVER_COOLDOWN_MS) {
        return
    }
    lastRecover = now
    try {
        hooks.restartTracking()
        startProbe()
    } catch (error) {
        console.error('[SaveWatchdog] failed to restart tracking', error)
    }
    try {
        hooks.forceSave()
        lastForced = now
    } catch (error) {
        console.error('[SaveWatchdog] failed to force save', error)
    }
    seenRuns = trackerRuns
    trackerSuspect = false
}

function tick() {
    const now = Date.now()
    const gap = now - lastTick
    lastTick = now

    //Timers are throttled in hidden tabs and paused during sleep,
    //so elapsed time says nothing there. Start measuring again.
    if (document.visibilityState !== 'visible' || gap > TICK_MS * 3) {
        lastBeat = now
        probeMisses = 0
        trackerSuspect = false
        seenRuns = trackerRuns
        seenFingerprint = safeFingerprint()
        return
    }

    //an effect threw: its dependencies may be incomplete now
    if (pendingEffectError) {
        const { name, error } = pendingEffectError
        pendingEffectError = null
        recover(false)
        notify('effectError', `${name}: ${errorText(error)}`)
    }

    //scheduler probe: effects run in a microtask, so an ack is long overdue by now
    if (ackUser === ping && ackPre === ping) {
        probeMisses = 0
        probeDead = false
        ping += 1
    }
    else {
        probeMisses += 1
        if (probeMisses >= 2 && !probeDead) {
            probeDead = true
            const missed = [ackUser !== ping && '$effect', ackPre !== ping && '$effect.pre'].filter(Boolean).join(', ')
            console.error('[SaveWatchdog] reactivity probe did not respond', { ping, ackUser, ackPre })
            recover(true)
            probeMisses = 0
            ping += 1
            notify('reactivity', missed)
        }
    }

    //change tracking: the data changed but the tracking effect did not run
    const fingerprint = safeFingerprint()
    const changedData = fingerprint !== seenFingerprint
    const ran = trackerRuns !== seenRuns
    if (ran) {
        trackerSuspect = false
        trackerDead = false
    }
    else if (trackerSuspect) {
        //still silent one full tick after the change
        trackerSuspect = false
        trackerDead = true
        console.error('[SaveWatchdog] save tracking effect missed a change')
        recover(true)
        notify('tracker', '')
    }
    else if (changedData) {
        if (trackerDead) {
            //tracking could not be revived: keep saving without it
            recover(false)
        }
        else {
            trackerSuspect = true
        }
    }
    seenFingerprint = fingerprint
    seenRuns = trackerRuns

    //save loop: idles in 500ms steps, so a long silence means a hung await or a dead loop
    if (lastBeat && now - lastBeat > LOOP_STALL_MS) {
        if (!loopNotified) {
            loopNotified = true
            console.error('[SaveWatchdog] save loop is not responding', { stage: loopStage, silentFor: now - lastBeat })
            notify('loop', loopStage)
        }
    }
    else {
        loopNotified = false
    }
}

function safeFingerprint() {
    try {
        return hooks?.fingerprint() ?? ''
    } catch {
        return seenFingerprint
    }
}

function errorText(error: unknown) {
    if (error instanceof Error) {
        return error.message
    }
    try {
        return String(error)
    } catch {
        return 'unknown error'
    }
}

let banner: HTMLDivElement | null = null
let bannerStatus: HTMLElement | null = null

function formatTime(time: number) {
    return new Date(time).toLocaleTimeString()
}

function statusText() {
    const text = language.saveWatchdog
    if (lastForced && lastSuccess >= lastForced) {
        return text.saved.replace('{}', formatTime(lastSuccess))
    }
    if (lastForced) {
        return text.saving
    }
    return lastSuccess ? text.lastSaved.replace('{}', formatTime(lastSuccess)) : ''
}

function updateStatus() {
    if (bannerStatus) {
        bannerStatus.textContent = statusText()
    }
    //keep the open alert current, e.g. once the requested save completes
    if (shownAlert && get(alertStore) === shownAlert) {
        shownAlert = { ...shownAlert, submsg: alertSubmsg() }
        alertStore.set(shownAlert)
    }
}

let shownAlert: alertData | null = null
let notifyRun = 0

function alertSubmsg() {
    return [language.saveWatchdog.advice, statusText()].filter(Boolean).join('\n')
}

function sleepPlain(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

/**
 * Shows the notice as a normal error alert.
 * Returns false when the alert could not be shown, so the caller can fall back.
 */
async function showAlert(message: string) {
    const run = ++notifyRun
    //Do not replace an alert the user is looking at, such as the error that caused this.
    //If rendering is dead that alert may never be closed, so do not wait for it then.
    while (get(alertStore).type !== 'none' && get(alertStore) !== shownAlert) {
        if (probeDead) {
            return false
        }
        await sleepPlain(200)
        if (run !== notifyRun) {
            return true
        }
    }
    const title = language.saveWatchdog.title
    shownAlert = {
        type: 'error',
        msg: `${title}\n\n${message}`,
        submsg: alertSubmsg(),
    }
    alertStore.set(shownAlert)

    //the store accepted it, but did it reach the screen?
    await sleepPlain(1500)
    if (run !== notifyRun || get(alertStore) !== shownAlert) {
        return true
    }
    if (document.body.textContent?.includes(title)) {
        return true
    }
    alertStore.set({ type: 'none', msg: '' })
    shownAlert = null
    return false
}

function notify(kind: StallKind, detail: string) {
    if (kind === 'loop') {
        //nothing was forced for this one; show the last save that did succeed
        lastForced = 0
    }
    const text = language.saveWatchdog
    const messages: Record<StallKind, string> = {
        tracker: text.tracker,
        reactivity: text.reactivity,
        loop: text.loop,
        effectError: text.effectError,
    }
    const message = messages[kind] + (detail ? ` (${detail})` : '')
    showAlert(message).then((shown) => {
        if (!shown) {
            showBanner(message)
        }
    }).catch((error) => {
        console.error('[SaveWatchdog] failed to show alert', error)
        showBanner(message)
    })
}

/**
 * Fallback notice built with plain DOM, for when Svelte rendering is what is broken.
 */
function showBanner(message: string) {
    try {
        const text = language.saveWatchdog

        //Same classes as the alerts in AlertComp.svelte and Button.svelte, so it follows the theme.
        //Shown at the top instead of as a modal: the app stays usable while saving is checked.
        banner?.remove()
        banner = document.createElement('div')
        banner.setAttribute('role', 'alert')
        banner.className = 'fixed top-4 left-1/2 -translate-x-1/2 z-1100 w-full max-w-xl px-2 pointer-events-none'

        const panel = document.createElement('div')
        panel.className = 'bg-darkbg text-textcolor border border-darkborderc p-4 rounded-md shadow-lg flex flex-col wrap-anywhere pointer-events-auto'

        const title = document.createElement('h2')
        title.textContent = text.title
        title.className = 'text-red-700 text-lg mt-0 mb-2'

        const body = document.createElement('span')
        body.textContent = message
        body.className = 'text-gray-300 whitespace-pre-wrap'

        const advice = document.createElement('span')
        advice.textContent = text.advice
        advice.className = 'text-gray-500 text-sm mt-2'

        bannerStatus = document.createElement('span')
        bannerStatus.className = 'text-gray-500 text-sm'

        const buttons = document.createElement('div')
        buttons.className = 'flex gap-2 w-full'

        const makeButton = (label: string, onClick: () => void) => {
            const button = document.createElement('button')
            button.type = 'button'
            button.textContent = label
            button.className = 'mt-4 grow bg-darkbutton hover:bg-selected focus:ring-selected border-darkborderc border text-textcolor rounded-md shadow-xs focus:outline-hidden focus:ring-2 transition-colors duration-200 px-4 py-2 text-md'
            button.addEventListener('click', onClick)
            buttons.appendChild(button)
        }

        makeButton(text.forceSave, () => {
            recover(true)
            updateStatus()
        })
        makeButton(text.dismiss, () => {
            banner?.remove()
            banner = null
            bannerStatus = null
        })

        panel.append(title, body, advice, bannerStatus, buttons)
        banner.appendChild(panel)
        document.body.appendChild(banner)
        updateStatus()
    } catch (error) {
        console.error('[SaveWatchdog] failed to show notice', error)
    }
}

export const saveWatchdog = {
    start(newHooks: WatchdogHooks) {
        hooks = newHooks
        if (started) {
            return
        }
        started = true
        lastTick = Date.now()
        lastBeat = lastTick
        seenFingerprint = safeFingerprint()
        seenRuns = trackerRuns
        startProbe()
        setInterval(() => {
            try {
                tick()
            } catch (error) {
                console.error('[SaveWatchdog] check failed', error)
            }
        }, TICK_MS)
    },
    /** Called by the save loop on every iteration and before each slow step. */
    beat(stage: string) {
        lastBeat = Date.now()
        loopStage = stage
    },
    saveSucceeded() {
        lastSuccess = Date.now()
        updateStatus()
    },
    /** Called by the change tracking effect every time it runs. */
    trackerRan() {
        trackerRuns += 1
    },
    effectError(name: string, error: unknown) {
        console.error(`[SaveWatchdog] save effect "${name}" threw`, error)
        pendingEffectError = { name, error }
    },
    /** The save loop ended, which it never should. */
    loopDied(error: unknown) {
        console.error('[SaveWatchdog] save loop stopped', error)
        loopNotified = true
        notify('loop', errorText(error))
    },
}
