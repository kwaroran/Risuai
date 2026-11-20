import { flushSync } from 'svelte'
import { writable } from 'svelte/store'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { toSaveType } from './risuSave'
import { createSaveTracking } from './saveTracking.svelte'

function emptyTracker(): toSaveType {
    return {
        character: [],
        chat: [],
        botPreset: false,
        modules: false,
        loadouts: false,
        plugins: false,
        pluginCustomStorage: false,
    }
}

function setup() {
    const db = $state({
        botPresetsId: 0,
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        username: 'user',
        characters: [
            { chaId: 'char-a', name: 'A', chatPage: 0, chats: [{ id: 'chat-1', message: [] as string[] }] },
        ],
    })
    const changeTracker = emptyTracker()
    const onChange = vi.fn()
    const onRevive = vi.fn()
    const tracking = createSaveTracking({
        db: () => db as any,
        selectedCharID: writable(0),
        changeTracker,
        onChange,
        onRevive,
    })
    tracking.start()
    flushSync()
    vi.advanceTimersByTime(500)
    onChange.mockClear()
    return { db, changeTracker, onChange, onRevive, tracking }
}

/** Runs a change and the flush it causes; returns the error the flush threw, if any. */
function change(fn: () => void) {
    try {
        flushSync(fn)
        return null
    } catch (error) {
        return error
    }
}

describe('save tracking', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
    })

    test('reports a chat change after the debounce', () => {
        const { db, changeTracker, onChange, tracking } = setup()
        change(() => {
            db.characters[0].chats[0].message.push('hello')
        })
        expect(onChange).not.toHaveBeenCalled()
        vi.advanceTimersByTime(500)
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(changeTracker.character[0]).toBe('char-a')
        expect(changeTracker.chat[0]).toEqual(['char-a', 'chat-1'])
        tracking.stop()
    })

    test('keeps reporting changes when a character has no chats', () => {
        const { db, changeTracker, onChange, tracking } = setup()
        changeTracker.chat = []
        expect(change(() => {
            db.characters[0].chats = []
        })).toBeNull()
        vi.advanceTimersByTime(500)
        expect(onChange).toHaveBeenCalledTimes(1)

        onChange.mockClear()
        change(() => {
            db.characters[0].name = 'renamed'
        })
        vi.advanceTimersByTime(500)
        expect(onChange).toHaveBeenCalledTimes(1)
        expect(changeTracker.chat).toEqual([])
        tracking.stop()
    })

    test('revive recovers tracking stalled by another effect that threw', () => {
        const { db, onChange, onRevive, tracking } = setup()
        const broken = $state({ value: 0 })
        const destroyBroken = $effect.root(() => {
            $effect(() => {
                if (broken.value > 0) {
                    throw new Error('unrelated effect failed')
                }
            })
        })
        flushSync()

        //the broken effect throws in the same flush as a database change
        expect(change(() => {
            broken.value = 1
            db.characters[0].chats[0].message.push('lost')
        })).toBeInstanceOf(Error)
        vi.advanceTimersByTime(500)

        //Svelte leaves the tracking effect dirty but never runs it again, even for
        //later changes. If this starts failing after a Svelte update, the stall may
        //have been fixed upstream.
        change(() => {
            db.characters[0].name = 'renamed'
        })
        vi.advanceTimersByTime(500)
        expect(onChange).not.toHaveBeenCalled()

        tracking.revive()
        vi.advanceTimersByTime(1000)
        expect(onRevive).toHaveBeenCalledTimes(1)
        flushSync()
        vi.advanceTimersByTime(500)
        expect(onChange).toHaveBeenCalledTimes(1)

        onChange.mockClear()
        change(() => {
            db.characters[0].chats[0].message.push('saved')
        })
        vi.advanceTimersByTime(500)
        expect(onChange).toHaveBeenCalledTimes(1)

        destroyBroken()
        tracking.stop()
    })

    test('revives once per burst of errors and at most every 10 seconds', () => {
        const { onRevive, tracking } = setup()
        tracking.revive()
        tracking.revive()
        tracking.revive()
        vi.advanceTimersByTime(1000)
        expect(onRevive).toHaveBeenCalledTimes(1)

        //another error soon after waits for the interval, but is not dropped
        vi.advanceTimersByTime(2000)
        tracking.revive()
        vi.advanceTimersByTime(7000)
        expect(onRevive).toHaveBeenCalledTimes(1)
        vi.advanceTimersByTime(1000)
        expect(onRevive).toHaveBeenCalledTimes(2)
        tracking.stop()
    })

    test('does nothing after stop', () => {
        const { onRevive, tracking } = setup()
        tracking.revive()
        tracking.stop()
        vi.advanceTimersByTime(20000)
        tracking.revive()
        vi.advanceTimersByTime(20000)
        expect(onRevive).not.toHaveBeenCalled()
    })
})
