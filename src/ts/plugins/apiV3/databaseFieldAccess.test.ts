import { describe, expect, it } from 'vitest'
import {
    applyDatabasePatch,
    dropFieldFilteredKeys,
    FIELD_FILTERED_KEYS_TAG,
    projectDbValue,
} from './databaseFieldAccess'

function makeCharacter(chaId: string, name: string) {
    return {
        chaId,
        name,
        modules: [] as string[],
        chats: [{ message: [{ role: 'user', data: `hello from ${name}` }] }],
    }
}

function makeColdStoredCharacter(chaId: string, name: string) {
    return {
        chaId,
        name,
        chats: [{ message: [{ role: 'char', data: '' }] }],
        chatPage: 0,
        coldstorage: `cold-${chaId}`,
    }
}

describe('projectDbValue', () => {
    it('returns the original value when no filter targets the key', () => {
        const characters = [makeCharacter('a', 'Alice')]

        const result = projectDbValue('characters', characters, { include: { modules: ['name'] } })

        expect(result.filtered).toBe(false)
        expect(result.value).toBe(characters)
    })

    it('keeps only included fields plus the identity field', () => {
        const result = projectDbValue('characters', [makeCharacter('a', 'Alice')], {
            include: { characters: ['name'] },
        })

        expect(result.filtered).toBe(true)
        expect(result.value).toEqual([{ chaId: 'a', name: 'Alice' }])
    })

    it('drops excluded fields but never the identity field', () => {
        const result = projectDbValue('characters', [makeCharacter('a', 'Alice')], {
            exclude: { characters: ['chats', 'chaId'] },
        })

        expect(result.value).toEqual([{ chaId: 'a', name: 'Alice', modules: [] }])
    })

    it('prefers include over exclude for the same key', () => {
        const result = projectDbValue('characters', [makeCharacter('a', 'Alice')], {
            include: { characters: ['name'] },
            exclude: { characters: ['name'] },
        })

        expect(result.value).toEqual([{ chaId: 'a', name: 'Alice' }])
    })

    it('keeps only the identity field for an empty include list, even with exclude set', () => {
        const characters = [makeCharacter('a', 'Alice')]

        expect(projectDbValue('characters', characters, {
            include: { characters: [] },
        })).toEqual({ value: [{ chaId: 'a' }], filtered: true })
        expect(projectDbValue('characters', characters, {
            include: { characters: [] },
            exclude: { characters: ['name'] },
        }).value).toEqual([{ chaId: 'a' }])
    })

    it('treats an empty exclude list as no filter', () => {
        const characters = [makeCharacter('a', 'Alice')]

        expect(projectDbValue('characters', characters, {
            exclude: { characters: [] },
        })).toEqual({ value: characters, filtered: false })
    })

    it('projects plain object values', () => {
        const seperateModels = { memory: 'm', emotion: 'e', translate: 't', otherAx: 'o' }

        const result = projectDbValue('seperateModels', seperateModels, {
            include: { seperateModels: ['memory'] },
        })

        expect(result).toEqual({ value: { memory: 'm' }, filtered: true })
    })

    it('does not add an identity field to keys without one', () => {
        const result = projectDbValue('personas', [{ id: 'p', name: 'Me', personaPrompt: 'long' }], {
            include: { personas: ['name'] },
        })

        expect(result.value).toEqual([{ name: 'Me' }])
    })

    it('does not count a key as filtered when the filter removes nothing', () => {
        const characters = [makeCharacter('a', 'Alice')]
        const enabledModules = ['m1', 'm2']
        const seperateModels = { memory: 'm' }

        expect(projectDbValue('characters', characters, {
            include: { characters: ['name', 'modules', 'chats'] },
        })).toEqual({ value: characters, filtered: false })
        expect(projectDbValue('characters', characters, {
            exclude: { characters: ['notAField'] },
        }).value).toBe(characters)
        expect(projectDbValue('enabledModules', enabledModules, {
            include: { enabledModules: ['x'] },
        })).toEqual({ value: enabledModules, filtered: false })
        expect(projectDbValue('seperateModels', seperateModels, {
            exclude: { seperateModels: ['emotion'] },
        })).toEqual({ value: seperateModels, filtered: false })
    })

    it('counts a key as filtered when any single item loses a field', () => {
        const characterOrder = ['a', { id: 'f1', name: 'Folder', data: ['a'] }]

        const result = projectDbValue('characterOrder', characterOrder, {
            exclude: { characterOrder: ['data'] },
        })

        expect(result).toEqual({ value: ['a', { id: 'f1', name: 'Folder' }], filtered: true })
    })

    it('keeps the cold storage marker on characters whatever the filter says', () => {
        const characters = [makeColdStoredCharacter('a', 'Alice')]

        expect(projectDbValue('characters', characters, {
            include: { characters: ['name'] },
        }).value).toEqual([{ chaId: 'a', name: 'Alice', coldstorage: 'cold-a' }])
        expect(projectDbValue('characters', characters, {
            exclude: { characters: ['chats', 'coldstorage'] },
        }).value).toEqual([{ chaId: 'a', name: 'Alice', chatPage: 0, coldstorage: 'cold-a' }])
    })

    it('passes primitive values through unfiltered', () => {
        expect(projectDbValue('temperature', 80, { include: { temperature: ['x'] } })).toEqual({
            value: 80,
            filtered: false,
        })
    })

    it.each([
        ['an include list that is not an array', { include: { characters: 'name' } }],
        ['an exclude list that is not an array', { exclude: { characters: { chats: true } } }],
        ['a field name that is not a string', { include: { characters: ['name', 1] } }],
        ['an include map that is not an object', { include: ['name'] }],
        ['options that are not an object', 'characters'],
    ])('rejects %s instead of returning the key unfiltered', (_label, filter) => {
        expect(() => projectDbValue('characters', [makeCharacter('a', 'Alice')], filter)).toThrow('getDatabase expects')
    })

    it('rejects a malformed list for a key whose value cannot be filtered', () => {
        expect(() => projectDbValue('temperature', 80, { include: { temperature: 'x' } })).toThrow('getDatabase expects')
    })

    it('treats undefined and null filter parts as no filter', () => {
        const characters = [makeCharacter('a', 'Alice')]
        const filters = [
            undefined,
            null,
            {},
            { include: null },
            { include: { characters: null }, exclude: { characters: undefined } },
        ]

        for (const filter of filters) {
            expect(projectDbValue('characters', characters, filter)).toEqual({ value: characters, filtered: false })
        }
    })
})

describe('dropFieldFilteredKeys', () => {
    it('returns untagged objects as-is', () => {
        const newDb = { characters: [] }

        const result = dropFieldFilteredKeys(newDb)

        expect(result.db).toBe(newDb)
        expect(result.dropped).toEqual([])
    })

    it('removes tagged keys and the tag without mutating the input', () => {
        const newDb = {
            characters: [{ chaId: 'a', name: 'Alice' }],
            enabledModules: ['m1'],
            [FIELD_FILTERED_KEYS_TAG]: ['characters'],
        }

        const result = dropFieldFilteredKeys(newDb)

        expect(result.db).toEqual({ enabledModules: ['m1'] })
        expect(result.dropped).toEqual(['characters'])
        expect(newDb.characters).toHaveLength(1)
    })
})

describe('applyDatabasePatch', () => {
    it('writes only the provided fields and keeps the rest', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }
        const chats = db.characters[0].chats

        applyDatabasePatch(db, { characters: [{ chaId: 'a', modules: ['m1'] }] })

        expect(db.characters[0].modules).toEqual(['m1'])
        expect(db.characters[0].name).toBe('Alice')
        expect(db.characters[0].chats).toBe(chats)
    })

    it('leaves entries absent from the patch untouched, including ones added after the read', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }
        const projected = projectDbValue('characters', db.characters, {
            include: { characters: ['name'] },
        }).value as Record<string, any>[]
        db.characters.push(makeCharacter('b', 'Bob'))
        projected[0].name = 'Alicia'

        applyDatabasePatch(db, { characters: projected })

        expect(db.characters.map((character) => character.name)).toEqual(['Alicia', 'Bob'])
        expect(db.characters[0].chats).toHaveLength(1)
    })

    it('writes and reports only the entries that changed when a filtered read is passed back as-is', () => {
        const db = { characters: [makeCharacter('a', 'Alice'), makeCharacter('b', 'Bob')] }
        const untouchedModules = db.characters[1].modules
        const projected = structuredClone(projectDbValue('characters', db.characters, {
            include: { characters: ['name', 'modules'] },
        }).value) as Record<string, any>[]
        projected[0].modules.push('m1')

        const result = applyDatabasePatch(db, { characters: projected })

        expect(result.patched).toEqual([{ key: 'characters', id: 'a' }])
        expect(db.characters[0].modules).toEqual(['m1'])
        expect(db.characters[1].modules).toBe(untouchedModules)
    })

    it('reports nothing when every sent field already matches', () => {
        const db = { modules: [{ id: 'm1', name: 'Same', lorebook: [{ key: 'k' }] }] }
        const lorebook = db.modules[0].lorebook

        const result = applyDatabasePatch(db, { modules: structuredClone(db.modules) })

        expect(result).toEqual({ patched: [], missing: [], coldStored: [] })
        expect(db.modules[0].lorebook).toBe(lorebook)
    })

    it('skips and reports entries that no longer exist instead of creating them', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }

        const result = applyDatabasePatch(db, {
            characters: [{ chaId: 'a', name: 'Alicia' }, { chaId: 'gone', name: 'Ghost' }],
        })

        expect(result.patched).toEqual([{ key: 'characters', id: 'a' }])
        expect(result.missing).toEqual([{ key: 'characters', id: 'gone' }])
        expect(db.characters).toHaveLength(1)
    })

    it('ignores the field-filter tag so getDatabase results can be passed back directly', () => {
        const db = { modules: [{ id: 'm1', name: 'Old', lorebook: [{ key: 'k' }] }] }

        applyDatabasePatch(db, {
            modules: [{ id: 'm1', name: 'New' }],
            [FIELD_FILTERED_KEYS_TAG]: ['modules'],
        })

        expect(db.modules[0]).toEqual({ id: 'm1', name: 'New', lorebook: [{ key: 'k' }] })
    })

    it('rejects unsupported keys before applying anything', () => {
        const db = { characters: [makeCharacter('a', 'Alice')], plugins: [] }

        expect(() => applyDatabasePatch(db, {
            characters: [{ chaId: 'a', name: 'Changed' }],
            plugins: [{ name: 'p', enabled: false }],
        })).toThrow('does not support "plugins"')
        expect(db.characters[0].name).toBe('Alice')
    })

    it('rejects entries without an identity field', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }

        expect(() => applyDatabasePatch(db, { characters: [{ name: 'Nameless' }] })).toThrow('"chaId"')
        expect(db.characters[0].name).toBe('Alice')
    })

    it('rejects ids that are not strings before applying anything', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }

        expect(() => applyDatabasePatch(db, {
            characters: [{ chaId: 'a', name: 'Changed' }, { chaId: 1 }],
        })).toThrow('"chaId"')
        expect(() => applyDatabasePatch(db, {
            characters: [{ chaId: 'a', name: 'Changed' }, { chaId: { toString: null } }],
        })).toThrow('"chaId"')
        expect(db.characters[0].name).toBe('Alice')
    })

    it('applies nothing when comparing a later field throws', () => {
        const db = { characters: [{ ...makeCharacter('a', 'Alice'), custom: { value: 1 } }] }
        const custom = Object.defineProperty({}, 'value', {
            enumerable: true,
            get() {
                throw new Error('unreadable')
            },
        })

        expect(() => applyDatabasePatch(db, {
            characters: [{ chaId: 'a', name: 'Changed', custom }],
        })).toThrow('unreadable')
        expect(db.characters[0].name).toBe('Alice')
    })

    it('lets the last entry win when an id is sent twice', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }

        const result = applyDatabasePatch(db, {
            characters: [{ chaId: 'a', name: 'Changed' }, { chaId: 'a', name: 'Alice' }],
        })

        expect(db.characters[0].name).toBe('Alice')
        expect(result.patched).toEqual([{ key: 'characters', id: 'a' }])
    })

    it('stops validating at the first invalid entry instead of walking the whole array', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }
        let indexReads = 0
        const entries = new Proxy(new Array(1000), {
            get(target, property, receiver) {
                if (typeof property === 'string' && /^\d+$/.test(property)) {
                    indexReads += 1
                }
                return Reflect.get(target, property, receiver)
            },
        })

        expect(() => applyDatabasePatch(db, { characters: entries })).toThrow('"chaId"')
        expect(indexReads).toBe(1)
    })

    it('skips and reports a cold-stored character instead of writing to its placeholder', () => {
        const db = { characters: [makeColdStoredCharacter('a', 'Alice')] }
        const placeholder = structuredClone(db.characters[0])

        const result = applyDatabasePatch(db, { characters: [{ chaId: 'a', modules: ['m1'] }] })

        expect(result).toEqual({ patched: [], missing: [], coldStored: [{ key: 'characters', id: 'a' }] })
        expect(db.characters[0]).toEqual(placeholder)
    })

    it.each([
        { include: { characters: ['name', 'chatPage'] } },
        { exclude: { characters: ['chats'] } },
    ])('skips an entry read from a placeholder once the character has been restored: %o', (filter) => {
        const db: { characters: Record<string, any>[] } = { characters: [makeColdStoredCharacter('a', 'Alice')] }
        const stale = structuredClone(projectDbValue('characters', db.characters, filter).value)
        db.characters[0] = { ...makeCharacter('a', 'Alice'), chatPage: 3 }

        const result = applyDatabasePatch(db, { characters: stale })

        expect(result).toEqual({ patched: [], missing: [], coldStored: [{ key: 'characters', id: 'a' }] })
        expect(db.characters[0]).toEqual({ ...makeCharacter('a', 'Alice'), chatPage: 3 })
    })

    it('reports nothing for a cold-stored character passed back unchanged', () => {
        const db = { characters: [makeColdStoredCharacter('a', 'Alice')] }
        const projected = structuredClone(projectDbValue('characters', db.characters, {
            include: { characters: ['name'] },
        }).value)

        expect(applyDatabasePatch(db, { characters: projected })).toEqual({ patched: [], missing: [], coldStored: [] })
    })

    it('ignores keys whose value is undefined', () => {
        const db = { characters: [makeCharacter('a', 'Alice')], modules: [{ id: 'm1', name: 'Old' }] }

        const result = applyDatabasePatch(db, { characters: undefined, modules: [{ id: 'm1', name: 'New' }] })

        expect(result.patched).toEqual([{ key: 'modules', id: 'm1' }])
        expect(db.modules[0].name).toBe('New')
    })

    it.each([
        ['a BigInt', { count: BigInt(1) }],
        ['a circular reference', (() => {
            const value: Record<string, any> = {}
            value.self = value
            return value
        })()],
    ])('rejects a value JSON cannot store before applying anything: %s', (_label, custom) => {
        const db = { characters: [makeCharacter('a', 'Alice'), makeCharacter('b', 'Bob')] }

        expect(() => applyDatabasePatch(db, {
            characters: [{ chaId: 'a', name: 'Changed' }, { chaId: 'b', custom }],
        })).toThrow('JSON')
        expect(db.characters[0].name).toBe('Alice')
        expect(db.characters[1]).not.toHaveProperty('custom')
    })

    it('rejects sparse arrays before applying anything', () => {
        const db = { characters: [makeCharacter('a', 'Alice')] }
        const sparse = structuredClone([{ chaId: 'a', name: 'Changed' }, , ])

        expect(() => applyDatabasePatch(db, { characters: sparse })).toThrow('"chaId"')
        expect(db.characters[0].name).toBe('Alice')
    })
})
