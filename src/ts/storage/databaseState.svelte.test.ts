import { flushSync } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DBState } from '../stores.svelte'
import { getDatabase, onDatabaseUpdate, setDatabaseLite, type Database } from './database.svelte'

vi.mock('../globalApi.svelte', () => ({
    downloadFile: vi.fn(),
    saveAsset: vi.fn(),
}))
vi.mock('../parser/parser.svelte', () => ({
    applyMarkdownToNode: vi.fn(),
    assetRegex: /$^/,
    hasher: vi.fn(),
    risuChatParser: vi.fn(),
    risuEscape: vi.fn((value: string) => value),
    risuUnescape: vi.fn((value: string) => value),
}))

class CustomValue {
    value = 1
}

function database(values: Partial<Database> = {}): Database {
    return {
        characters: [],
        ...values,
    } as Database
}

afterEach(() => {
    setDatabaseLite(database())
})

describe('database proxy layering', () => {
    it('tracks nested mutations after receiving a plain object', () => {
        setDatabaseLite(database({ pluginCustomStorage: { plugin: { enabled: false } } }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.pluginCustomStorage.plugin.enabled = true

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            path: ['pluginCustomStorage', 'plugin', 'enabled'],
            value: true,
            oldValue: false,
            type: 'set',
        }))
        unsubscribe()
    })

    it('keeps Svelte reactivity outside the database proxy', () => {
        setDatabaseLite(database({ username: 'before' }))
        let observed = ''
        const dispose = $effect.root(() => {
            $effect(() => {
                observed = DBState.db.username
            })
        })

        flushSync()
        DBState.db.username = 'after'
        flushSync()

        expect(observed).toBe('after')
        dispose()
    })

    it('does not add another database proxy when passed the wrapped database again', () => {
        setDatabaseLite(database({ username: 'before' }))
        setDatabaseLite(DBState.db)
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.username = 'after'

        expect(listener).toHaveBeenCalledTimes(1)
        unsubscribe()
    })

    it('tracks mutations after restoring a plain snapshot', () => {
        setDatabaseLite(database({ username: 'backup' }))
        const backup = structuredClone(getDatabase({ snapshot: true }))
        setDatabaseLite(backup)
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.username = 'restored and edited'

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            path: ['username'],
            value: 'restored and edited',
        }))
        unsubscribe()
    })

    it('does not proxy non-plain objects', () => {
        const date = new Date()
        const map = new Map([['key', 'value']])
        const set = new Set(['value'])
        const bytes = new Uint8Array([1, 2])
        const instance = new CustomValue()
        setDatabaseLite(database({ pluginCustomStorage: { date, map, set, bytes, instance } }))
        const storage = DBState.db.pluginCustomStorage

        expect(storage.date).toBe(date)
        expect(storage.map).toBe(map)
        expect(storage.set).toBe(set)
        expect(storage.bytes).toBe(bytes)
        expect(storage.instance).toBe(instance)
    })

    it('reports the access path used for shared plain objects', () => {
        const shared = { value: 0 }
        setDatabaseLite(database({ pluginCustomStorage: { first: shared, second: shared } }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.pluginCustomStorage.first.value = 1
        DBState.db.pluginCustomStorage.second.value = 2

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'first', 'value'],
            ['pluginCustomStorage', 'second', 'value'],
        ])
        unsubscribe()
    })

    it('reports the actual non-current chat index in nested mutation paths', () => {
        setDatabaseLite(database({
            characters: [{
                chaId: 'character',
                chatPage: 0,
                chats: [
                    { id: 'current', message: [] },
                    { id: 'other', message: [] },
                ],
            }] as Database['characters'],
        }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters[0].chats[1].message.push({ role: 'user', data: 'changed' })

        expect(listener.mock.calls.some(([info]) =>
            info.path[0] === 'characters' && info.path[1] === 0 && info.path[2] === 'chats' && info.path[3] === 1
        )).toBe(true)
        unsubscribe()
    })

    it('preserves old and new identities in character replacement and splice events', () => {
        const makeCharacter = (chaId: string) => ({ chaId, chatPage: 0, chats: [{ id: `${chaId}-chat`, message: [] }] })
        setDatabaseLite(database({
            characters: [makeCharacter('A'), makeCharacter('B'), makeCharacter('C')] as Database['characters'],
        }))
        const events: { path: (string | number | symbol)[], oldValue: unknown, value: unknown }[] = []
        const unsubscribe = onDatabaseUpdate((event) => events.push(event))

        DBState.db.characters.splice(1, 1)

        expect(events).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: ['characters', 1], oldValue: expect.objectContaining({ chaId: 'B' }), value: expect.objectContaining({ chaId: 'C' }) }),
            expect.objectContaining({ path: ['characters', 2], oldValue: expect.objectContaining({ chaId: 'C' }), value: undefined }),
        ]))
        unsubscribe()
    })

    it('preserves complete old and new chat arrays in replacement events', () => {
        setDatabaseLite(database({
            characters: [{
                chaId: 'A',
                chatPage: 0,
                chats: [{ id: 'old-0', message: [] }, { id: 'old-1', message: [] }],
            }] as Database['characters'],
        }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters[0].chats = [{ id: 'new-0', message: [] }] as Database['characters'][number]['chats']

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            path: ['characters', 0, 'chats'],
            oldValue: [expect.objectContaining({ id: 'old-0' }), expect.objectContaining({ id: 'old-1' })],
            value: [expect.objectContaining({ id: 'new-0' })],
        }))
        unsubscribe()
    })

    it('reports characters removed by direct array truncation', () => {
        const makeCharacter = (chaId: string) => ({ chaId, chatPage: 0, chats: [{ id: `${chaId}-chat`, message: [] }] })
        setDatabaseLite(database({
            characters: [makeCharacter('A'), makeCharacter('B'), makeCharacter('C')] as Database['characters'],
        }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters.length = 1

        expect(listener.mock.calls.map(([info]) => ({ path: info.path, oldValue: info.oldValue }))).toEqual([
            { path: ['characters', 2], oldValue: expect.objectContaining({ chaId: 'C' }) },
            { path: ['characters', 1], oldValue: expect.objectContaining({ chaId: 'B' }) },
            { path: ['characters', 'length'], oldValue: 3 },
        ])
        unsubscribe()
    })

    it('reports chats removed by direct array truncation', () => {
        setDatabaseLite(database({
            characters: [{
                chaId: 'A',
                chatPage: 0,
                chats: [
                    { id: 'chat-0', message: [] },
                    { id: 'chat-1', message: [] },
                    { id: 'chat-2', message: [] },
                ],
            }] as Database['characters'],
        }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters[0].chats.length = 1

        expect(listener.mock.calls.map(([info]) => ({ path: info.path, oldValue: info.oldValue }))).toEqual([
            { path: ['characters', 0, 'chats', 2], oldValue: expect.objectContaining({ id: 'chat-2' }) },
            { path: ['characters', 0, 'chats', 1], oldValue: expect.objectContaining({ id: 'chat-1' }) },
            { path: ['characters', 0, 'chats', 'length'], oldValue: 3 },
        ])
        unsubscribe()
    })

    it('does not duplicate deletion events from pop', () => {
        const makeCharacter = (chaId: string) => ({ chaId, chatPage: 0, chats: [{ id: `${chaId}-chat`, message: [] }] })
        setDatabaseLite(database({
            characters: [makeCharacter('A'), makeCharacter('B')] as Database['characters'],
        }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters.pop()

        expect(listener.mock.calls.filter(([info]) => info.type === 'delete')).toHaveLength(1)
        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            path: ['characters', 1],
            oldValue: expect.objectContaining({ chaId: 'B' }),
            type: 'delete',
        }))
        unsubscribe()
    })

    it('exposes database replacement as shallow-readonly', () => {
        if (false) {
            // @ts-expect-error Database replacement must use setDatabaseLite().
            DBState.db = database()
        }
        DBState.db.characters.push({} as Database['characters'][number])
    })
})
