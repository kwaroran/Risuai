import type { Readable } from 'svelte/store'
import type { Database } from './database.svelte'
import type { toSaveType } from './risuSave'

const DEBOUNCE_MS = 500
/** Shortest time between two revivals, so an error that repeats does not keep forcing full saves. */
const REVIVE_INTERVAL_MS = 10000
/** Short wait before a revival, so a burst of errors is handled once, after the last flush settles. */
const REVIVE_DELAY_MS = 1000

export interface SaveTrackingOptions {
    db: () => Database
    selectedCharID: Readable<number>
    /** Filled with what changed, for the save loop to pick up. */
    changeTracker: toSaveType
    /** Called once the changes settle, to wake the save loop. */
    onChange: () => void
    /** Called after the tracking effects were recreated, before they run again. */
    onRevive: () => void
}

/**
 * Effects that notice database changes and report them to the save loop.
 *
 * When any effect in the app throws while Svelte flushes its queue, the effects
 * that were still waiting in that flush stay marked dirty but are never run or
 * scheduled again. If one of them is a tracking effect, changes stop reaching the
 * save loop until the app is reloaded. Effects created afterwards are not affected,
 * so `revive` recreates them.
 */
export function createSaveTracking(options: SaveTrackingOptions) {
    let stopCurrent: (() => void) | null = null
    let reviveTimer: ReturnType<typeof setTimeout> | null = null
    let lastRevive = -Infinity

    function start() {
        stopCurrent?.()

        let saveTimeout: ReturnType<typeof setTimeout> | null = null
        function changed() {
            if (saveTimeout) {
                clearTimeout(saveTimeout)
            }
            saveTimeout = setTimeout(options.onChange, DEBOUNCE_MS)
        }

        //Each effect reports a change even when reading the data fails, and does not
        //throw: an error escaping from here would stall the other effects in the flush.
        function track(name: string, read: () => void) {
            $effect(() => {
                try {
                    read()
                } catch (error) {
                    console.error(`[SaveTracking] ${name} tracking failed`, error)
                }
                changed()
            })
        }

        let unsubscribe: (() => void) | null = null
        const destroyRoot = $effect.root(() => {
            let selIdState = $state(0)
            unsubscribe = options.selectedCharID.subscribe((v) => {
                selIdState = v
            })
            const { changeTracker } = options

            track('botPreset', () => {
                const db = options.db()
                db.botPresetsId
                db.botPresets.length
                changeTracker.botPreset = true
            })
            track('modules', () => {
                $state.snapshot(options.db().modules)
                changeTracker.modules = true
            })
            track('loadouts', () => {
                $state.snapshot(options.db().loadouts)
                changeTracker.loadouts = true
            })
            track('plugins', () => {
                $state.snapshot(options.db().plugins)
                changeTracker.plugins = true
            })
            track('pluginCustomStorage', () => {
                $state.snapshot(options.db().pluginCustomStorage)
                changeTracker.pluginCustomStorage = true
            })
            track('database', () => {
                const db = options.db()
                for (const key in db) {
                    if (
                        key !== 'characters' && key !== 'botPresets' && key !== 'modules' &&
                        key !== 'loadouts' && key !== 'plugins' && key !== 'pluginCustomStorage'
                    ) {
                        $state.snapshot(db[key])
                    }
                }
                const char = db?.characters?.[selIdState]
                if (!char) {
                    return
                }
                for (const key in char) {
                    if (key !== 'chats') {
                        $state.snapshot(char[key])
                    }
                }
                $state.snapshot(char.chats)
                if (changeTracker.character[0] !== char.chaId) {
                    changeTracker.character.unshift(char.chaId)
                }
                //chats can be empty, or chatPage can point past them while they are edited
                const chat = char.chats?.[char.chatPage]
                if (chat && (changeTracker.chat[0]?.[0] !== char.chaId || changeTracker.chat[0]?.[1] !== chat.id)) {
                    changeTracker.chat.unshift([char.chaId, chat.id])
                }
            })
        })

        stopCurrent = () => {
            unsubscribe?.()
            destroyRoot()
        }
    }

    function stop() {
        if (reviveTimer) {
            clearTimeout(reviveTimer)
            reviveTimer = null
        }
        stopCurrent?.()
        stopCurrent = null
    }

    /**
     * Recreates the tracking effects after an uncaught error, in case that error
     * stalled them. Changes made while they were stalled were not recorded, so
     * `onRevive` should make the next save cover everything.
     */
    function revive() {
        if (reviveTimer || !stopCurrent) {
            return
        }
        const wait = Math.max(REVIVE_DELAY_MS, lastRevive + REVIVE_INTERVAL_MS - Date.now())
        reviveTimer = setTimeout(() => {
            reviveTimer = null
            if (!stopCurrent) {
                return
            }
            lastRevive = Date.now()
            start()
            options.onRevive()
        }, wait)
    }

    return { start, stop, revive }
}

export type SaveTracking = ReturnType<typeof createSaveTracking>
