import { flushSync } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { toSaveType } from './risuSave'
import { registerSaveChangeTracking } from './saveChangeTracking.svelte'

function makeChat(id: string, count: number): Record<string, any> {
    return {
        id,
        name: id,
        note: '',
        localLore: [],
        message: Array.from({ length: count }, (_, i) => ({ role: i % 2 ? 'char' : 'user', data: `${id} ${i}` })),
    }
}

function makeDb() {
    return {
        username: 'tester',
        theme: 'dark',
        botPresets: [],
        modules: [],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: {},
        characters: [
            {
                chaId: 'cha-a',
                name: 'A',
                reloadKeys: 0,
                chatPage: 1,
                chats: [makeChat('a1', 3), makeChat('a2', 3), makeChat('a3', 3)],
            },
            {
                chaId: 'cha-b',
                name: 'B',
                reloadKeys: 0,
                chatPage: 0,
                chats: [makeChat('b1', 2)],
            },
        ],
    }
}

describe('registerSaveChangeTracking', () => {
    let state: { db: ReturnType<typeof makeDb>, selected: number }
    let tracker: toSaveType
    let runs = 0
    let cleanup: () => void

    function resetTracker() {
        tracker.character.length = 0
        tracker.chat.length = 0
        tracker.allChats.length = 0
        runs = 0
    }

    beforeEach(() => {
        const fresh = $state({ db: makeDb(), selected: 0 })
        state = fresh
        tracker = {
            character: [],
            chat: [],
            allChats: [],
            botPreset: false,
            modules: false,
            loadouts: false,
            plugins: false,
            pluginCustomStorage: false,
        }
        runs = 0
        cleanup = $effect.root(() => {
            registerSaveChangeTracking({
                tracker,
                getDb: () => state.db,
                getSelectedIndex: () => state.selected,
                onChange: () => {
                    runs++
                },
            })
        })
        flushSync()
    })

    afterEach(() => {
        cleanup()
    })

    it('marks the selected character, its current chat and all its chats on start', () => {
        expect(runs).toBe(4)
        expect(tracker.character).toEqual(['cha-a'])
        expect(tracker.chat).toEqual([['cha-a', 'a2']])
        expect(tracker.allChats).toEqual(['cha-a'])
    })

    it('a streaming update of the current chat only re-runs the current chat effect', () => {
        resetTracker()
        const chat = state.db.characters[0].chats[1]
        chat.message[chat.message.length - 1].data += ' more'
        state.db.characters[0].reloadKeys += 1
        flushSync()
        expect(runs).toBe(1)
        expect(tracker.character).toEqual(['cha-a'])
        expect(tracker.chat).toEqual([['cha-a', 'a2']])
        expect(tracker.allChats).toEqual([])

        resetTracker()
        chat.message.push({ role: 'char', data: 'new message' })
        state.db.characters[0].chats[1].isStreaming = true
        flushSync()
        expect(runs).toBe(1)
        expect(tracker.allChats).toEqual([])
    })

    it('a change in another chat marks all chats dirty', () => {
        resetTracker()
        state.db.characters[0].chats[2].message[0].data = 'edited'
        flushSync()
        expect(runs).toBe(1)
        expect(tracker.character).toEqual(['cha-a'])
        expect(tracker.chat).toEqual([])
        expect(tracker.allChats).toEqual(['cha-a'])
    })

    it('adding or removing chats marks all chats dirty', () => {
        resetTracker()
        state.db.characters[0].chats.push(makeChat('a4', 1))
        flushSync()
        expect(tracker.allChats).toEqual(['cha-a'])

        resetTracker()
        state.db.characters[0].chats.splice(0, 1)
        flushSync()
        expect(tracker.allChats).toEqual(['cha-a'])
    })

    it('a root setting change marks the selected character without chats', () => {
        resetTracker()
        state.db.theme = 'light'
        flushSync()
        expect(runs).toBe(1)
        expect(tracker.character).toEqual(['cha-a'])
        expect(tracker.chat).toEqual([])
        expect(tracker.allChats).toEqual([])
    })

    it('a character field change does not touch the chat effects', () => {
        resetTracker()
        state.db.characters[0].name = 'A2'
        flushSync()
        expect(runs).toBe(1)
        expect(tracker.character).toEqual(['cha-a'])
        expect(tracker.chat).toEqual([])
        expect(tracker.allChats).toEqual([])
    })

    it('changing the chat page marks the new current chat', () => {
        resetTracker()
        state.db.characters[0].chatPage = 2
        flushSync()
        expect(tracker.character).toEqual(['cha-a'])
        expect(tracker.chat).toEqual([['cha-a', 'a3']])
        expect(tracker.allChats).toEqual(['cha-a'])
    })

    it('changing the selected character tracks the new one', () => {
        resetTracker()
        state.selected = 1
        flushSync()
        expect(tracker.character).toEqual(['cha-b'])
        expect(tracker.chat).toEqual([['cha-b', 'b1']])
        expect(tracker.allChats).toEqual(['cha-b'])

        resetTracker()
        state.db.characters[0].chats[0].message[0].data = 'not selected anymore'
        flushSync()
        expect(runs).toBe(0)
    })

    it('does nothing for the character effects when no character is selected', () => {
        resetTracker()
        state.selected = -1
        flushSync()
        expect(tracker.character).toEqual([])
        state.db.theme = 'light'
        flushSync()
        expect(runs).toBe(1)
        expect(tracker.character).toEqual([])
    })
})
