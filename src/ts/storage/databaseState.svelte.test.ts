import { flushSync } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DBState } from '../stores.svelte'
import { getDatabase, onDatabaseUpdate, setDatabaseLite, type character, type Chat, type Database } from './database.svelte'

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

    it('does not proxy non-plain or frozen objects', () => {
        const date = new Date()
        const map = new Map([['key', 'value']])
        const set = new Set(['value'])
        const bytes = new Uint8Array([1, 2])
        const instance = new CustomValue()
        const frozen = Object.freeze({ nested: Object.freeze({ value: 1 }) })
        setDatabaseLite(database({ pluginCustomStorage: { date, map, set, bytes, instance, frozen } }))
        const storage = DBState.db.pluginCustomStorage

        expect(storage.date).toBe(date)
        expect(storage.map).toBe(map)
        expect(storage.set).toBe(set)
        expect(storage.bytes).toBe(bytes)
        expect(storage.instance).toBe(instance)
        expect(storage.frozen.nested.value).toBe(1)
        expect(JSON.parse(JSON.stringify(getDatabase())).pluginCustomStorage.frozen).toEqual({
            nested: { value: 1 },
        })
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

    it('resolves paths through characters and chats after they move', () => {
        const makeCharacter = (chaId: string) => ({
            chaId,
            name: chaId,
            chatPage: 0,
            chats: [
                { id: `${chaId}-first`, message: [] },
                { id: `${chaId}-second`, message: [] },
            ],
        })
        setDatabaseLite(database({ characters: [makeCharacter('A'), makeCharacter('B')] as character[] }))
        const movedCharacter = DBState.db.characters[1]
        const movedMessages = movedCharacter.chats[1].message
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters.splice(0, 1)
        DBState.db.characters[0].chats.splice(0, 1)
        listener.mockClear()
        movedCharacter.name = 'moved'
        movedMessages.push({ role: 'user', data: 'moved' })
        DBState.db.characters[0].name = 're-accessed'
        DBState.db.characters[0].chats[0].message.push({ role: 'user', data: 're-accessed' })

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['characters', 0, 'name'],
            ['characters', 0, 'chats', 0, 'message', 0],
            ['characters', 0, 'name'],
            ['characters', 0, 'chats', 0, 'message', 1],
        ])
        unsubscribe()
    })

    it('resolves retained chat paths after unshift', () => {
        setDatabaseLite(database({
            characters: [{
                chaId: 'character',
                chatPage: 0,
                chats: [
                    { id: 'first', message: [] },
                    { id: 'moved', message: [] },
                ],
            }] as character[],
        }))
        const movedMessages = DBState.db.characters[0].chats[1].message
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters[0].chats.unshift({ id: 'inserted', message: [] } as Chat)
        listener.mockClear()
        movedMessages.push({ role: 'user', data: 'after unshift' })

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            path: ['characters', 0, 'chats', 2, 'message', 0],
        }))
        unsubscribe()
    })

    it('resolves moved elements in other database arrays', () => {
        setDatabaseLite(database({ pluginCustomStorage: { items: [{ value: 0 }, { value: 1 }] } }))
        const movedItem = DBState.db.pluginCustomStorage.items[1]
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.pluginCustomStorage.items.splice(0, 1)
        listener.mockClear()
        movedItem.value = 2

        expect(listener).toHaveBeenCalledWith(expect.objectContaining({
            path: ['pluginCustomStorage', 'items', 0, 'value'],
        }))
        unsubscribe()
    })

    it('does not emit from detached or inactive proxies', () => {
        const makeCharacter = (chaId: string) => ({ chaId, name: chaId, chatPage: 0, chats: [] })
        setDatabaseLite(database({
            characters: [makeCharacter('A'), makeCharacter('B')] as character[],
            pluginCustomStorage: { nested: { value: 0 } },
        }))
        const detachedCharacter = DBState.db.characters[1]
        const oldRoot = DBState.db
        const oldNested = DBState.db.pluginCustomStorage.nested
        DBState.db.characters.splice(1, 1)
        setDatabaseLite(database())
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        detachedCharacter.name = 'detached'
        oldRoot.username = 'inactive'
        oldNested.value = 1

        expect(listener).not.toHaveBeenCalled()
        unsubscribe()
    })

    it('tracks a retained proxy after it is attached to the active root', () => {
        setDatabaseLite(database({ pluginCustomStorage: { retained: { value: 0 } } }))
        const retained = DBState.db.pluginCustomStorage.retained
        setDatabaseLite(database({ pluginCustomStorage: {} }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.pluginCustomStorage.reattached = retained
        listener.mockClear()
        retained.value = 1
        DBState.db.pluginCustomStorage.reattached.value = 2

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'reattached', 'value'],
            ['pluginCustomStorage', 'reattached', 'value'],
        ])
        unsubscribe()
    })

    it('tracks a retained child after replacing and reordering its container', () => {
        setDatabaseLite(database({
            pluginCustomStorage: {
                container: { items: [{ value: 0 }, { value: 1 }] },
            },
        }))
        const retained = DBState.db.pluginCustomStorage.container.items[1]
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.pluginCustomStorage.container = { items: [retained, { value: 2 }] }
        listener.mockClear()
        retained.value = 3

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'container', 'items', 0, 'value'],
        ])
        unsubscribe()
    })

    it('eagerly connects retained proxies through newly attached intermediate objects', () => {
        setDatabaseLite(database({ pluginCustomStorage: { retained: { value: 0 } } }))
        const retained = DBState.db.pluginCustomStorage.retained
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.pluginCustomStorage = { wrapper: { nested: { retained } } }
        listener.mockClear()
        retained.value = 1

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'wrapper', 'nested', 'retained', 'value'],
        ])
        unsubscribe()
    })

    it('eagerly connects retained proxies during root replacement', () => {
        setDatabaseLite(database({ pluginCustomStorage: { retained: { value: 0 } } }))
        const retained = DBState.db.pluginCustomStorage.retained

        setDatabaseLite(database({
            pluginCustomStorage: { wrapper: { nested: { retained } } },
        }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        retained.value = 1

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'wrapper', 'nested', 'retained', 'value'],
        ])
        unsubscribe()
    })

    it('keeps deeply reattached proxies serializable at snapshot and save boundaries', () => {
        setDatabaseLite(database({ pluginCustomStorage: { retained: { value: 0 } } }))
        const retained = DBState.db.pluginCustomStorage.retained

        DBState.db.pluginCustomStorage = { wrapper: { nested: { retained } } }
        retained.value = 1

        const snapshot = structuredClone(getDatabase({ snapshot: true }))
        const serialized = JSON.parse(JSON.stringify(getDatabase()))

        expect(snapshot.pluginCustomStorage.wrapper.nested.retained.value).toBe(1)
        expect(serialized.pluginCustomStorage.wrapper.nested.retained.value).toBe(1)
    })

    it('emits every active path for a shared retained proxy', () => {
        setDatabaseLite(database({ pluginCustomStorage: { first: { value: 0 } } }))
        const shared = DBState.db.pluginCustomStorage.first
        DBState.db.pluginCustomStorage.second = shared
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        shared.value = 1

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'first', 'value'],
            ['pluginCustomStorage', 'second', 'value'],
        ])
        unsubscribe()
    })

    it('removes only the replaced edge to a shared retained proxy', () => {
        setDatabaseLite(database({ pluginCustomStorage: { first: { value: 0 } } }))
        const shared = DBState.db.pluginCustomStorage.first
        DBState.db.pluginCustomStorage.second = shared
        delete DBState.db.pluginCustomStorage.first
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        shared.value = 1

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'second', 'value'],
        ])
        unsubscribe()
    })

    it('does not emit from a detached retained proxy', () => {
        setDatabaseLite(database({ pluginCustomStorage: { retained: { value: 0 } } }))
        const retained = DBState.db.pluginCustomStorage.retained
        delete DBState.db.pluginCustomStorage.retained
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        retained.value = 1

        expect(listener).not.toHaveBeenCalled()
        unsubscribe()
    })

    it('does not duplicate propagation after repeated container replacements', () => {
        setDatabaseLite(database({ pluginCustomStorage: { retained: { value: 0 } } }))
        const retained = DBState.db.pluginCustomStorage.retained
        DBState.db.pluginCustomStorage = { wrapper: { retained } }
        DBState.db.pluginCustomStorage = { wrapper: { retained } }
        DBState.db.pluginCustomStorage = { wrapper: { retained } }
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        retained.value = 1

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'wrapper', 'retained', 'value'],
        ])
        unsubscribe()
    })

    it('disconnects array elements removed by length shrink', () => {
        setDatabaseLite(database({
            pluginCustomStorage: {
                items: [{ value: 0 }, { value: 1 }, { value: 2 }],
            },
        }))
        const retained = DBState.db.pluginCustomStorage.items[2]
        DBState.db.pluginCustomStorage.items.length = 1
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        retained.value = 3
        DBState.db.pluginCustomStorage.items[0].value = 4

        expect(listener.mock.calls.map(([info]) => info.path)).toEqual([
            ['pluginCustomStorage', 'items', 0, 'value'],
        ])
        unsubscribe()
    })

    it('does not emit when deleting a missing property', () => {
        setDatabaseLite(database({ pluginCustomStorage: {} }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        delete DBState.db.pluginCustomStorage.missing

        expect(listener).not.toHaveBeenCalled()
        unsubscribe()
    })

    it('emits root replacement as an empty path', () => {
        const oldValue = DBState.db
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        setDatabaseLite(DBState.db)
        setDatabaseLite(database({ username: 'replacement' }))

        expect(listener).toHaveBeenCalledTimes(1)
        expect(listener).toHaveBeenCalledWith({
            path: [],
            value: DBState.db,
            oldValue,
            type: 'set',
        })
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
            }] as character[],
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
            characters: [makeCharacter('A'), makeCharacter('B'), makeCharacter('C')] as character[],
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
            }] as character[],
        }))
        const listener = vi.fn()
        const unsubscribe = onDatabaseUpdate(listener)

        DBState.db.characters[0].chats = [{ id: 'new-0', message: [] }] as Chat[]

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
            characters: [makeCharacter('A'), makeCharacter('B'), makeCharacter('C')] as character[],
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
            }] as character[],
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
            characters: [makeCharacter('A'), makeCharacter('B')] as character[],
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
        DBState.db.characters.push({} as character)
    })
})
