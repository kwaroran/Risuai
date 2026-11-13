import { get, writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { alertData } from './alert'

const text = {
    title: 'Save problem',
    notSaved: 'Not saved',
    appError: 'App error',
    stuck: 'Stuck',
    advice: 'Advice.',
    stuckAdvice: 'Stuck advice.',
    forceSave: 'Save now',
    dismiss: 'Dismiss',
    saving: 'Saving again...',
    saved: 'Saved at {}.',
    lastSaved: 'Last saved at {}',
}

vi.mock(import('src/lang'), () => ({ language: { saveWatchdog: text } }) as any)

const alertStore = writable<alertData>({ type: 'none', msg: '' })
vi.mock(import('./stores.svelte'), () => ({ alertStore }) as any)

const TICK_MS = 5000

async function startWatchdog() {
    vi.resetModules()
    const { saveWatchdog } = await import('./saveWatchdog.svelte')
    const forceSave = vi.fn()
    saveWatchdog.start({
        fingerprint: () => '',
        restartTracking: () => {},
        forceSave,
    })
    return { saveWatchdog, forceSave }
}

/** Makes the next tick force a save and show the notice, like a thrown tracking effect. */
async function triggerNotice(saveWatchdog: Awaited<ReturnType<typeof startWatchdog>>['saveWatchdog']) {
    saveWatchdog.effectError('database', new Error('boom'))
    await vi.advanceTimersByTimeAsync(TICK_MS)
}

beforeEach(() => {
    vi.useFakeTimers()
    alertStore.set({ type: 'none', msg: '' })
    document.body.innerHTML = ''
    vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('forced save status', () => {
    test('a save that started before the request does not complete it', async () => {
        const { saveWatchdog, forceSave } = await startWatchdog()
        //a save is already running with the old data
        const inFlight = saveWatchdog.saveStarted()

        await triggerNotice(saveWatchdog)
        expect(forceSave).toHaveBeenCalledTimes(1)
        expect(get(alertStore).submsg).toContain(text.saving)

        //the old save finishes after the request was made
        saveWatchdog.saveSucceeded(inFlight)
        expect(get(alertStore).submsg).toContain(text.saving)
        expect(get(alertStore).submsg).not.toContain('Saved at')

        //the save that picked up the request finishes
        const requested = saveWatchdog.saveStarted()
        saveWatchdog.saveSucceeded(requested)
        expect(get(alertStore).submsg).toContain('Saved at')
    })
})

describe('notice while another alert is open', () => {
    test('falls back to the DOM notice when the open alert never closes', async () => {
        const { saveWatchdog } = await startWatchdog()
        const existing: alertData = { type: 'error', msg: 'earlier error' }
        alertStore.set(existing)

        await triggerNotice(saveWatchdog)
        //still waiting for the user to close the earlier alert
        expect(document.body.querySelector('[role="alert"]')).toBeNull()

        await vi.advanceTimersByTimeAsync(10000)
        const banner = document.body.querySelector('[role="alert"]')
        expect(banner?.textContent).toContain(text.title)
        //the earlier alert is left as it was
        expect(get(alertStore)).toBe(existing)
    })

    test('uses the normal alert when the open alert is closed in time', async () => {
        const { saveWatchdog } = await startWatchdog()
        alertStore.set({ type: 'error', msg: 'earlier error' })

        await triggerNotice(saveWatchdog)
        alertStore.set({ type: 'none', msg: '' })
        await vi.advanceTimersByTimeAsync(200)

        expect(get(alertStore).msg).toContain(text.title)
        expect(document.body.querySelector('[role="alert"]')).toBeNull()
    })
})
