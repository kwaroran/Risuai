import { describe, expect, it } from 'vitest'
import {
    applyDatabasePatch,
    dropFieldFilteredKeys,
    FIELD_FILTERED_KEYS_TAG,
    patchReadsDatabase,
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

const patchOptions = {
    allowedKeys: ['characters', 'modules', 'enabledModules', 'personas', 'plugins', 'pluginCustomStorage', 'temperature', 'seperateModels'],
    readOnlyPaths: [['plugins'], ['pluginCustomStorage', '_coldpluginIndex']],
}

function applyPatch(db: Record<string, any>, operations: unknown) {
    return applyDatabasePatch(db, operations, patchOptions)
}

function makeDb() {
    return {
        characters: [makeCharacter('a', 'Alice'), makeCharacter('b', 'Bob')] as Record<string, any>[],
        modules: [{ id: 'm1', name: 'Mod', lorebook: [{ key: 'k', content: 'c' }] }],
        enabledModules: ['m1'],
        personas: [{ name: 'Me', personaPrompt: 'long', icon: '' }],
        plugins: [{ name: 'p', script: 'code', enabled: true }],
        pluginCustomStorage: { mine: 'value', _coldpluginIndex: 'index' } as Record<string, any>,
        temperature: 80 as unknown,
        seperateModels: { memory: 'm', emotion: 'e', translate: 't', otherAx: 'o' },
        account: { token: 't' },
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

describe('patchReadsDatabase', () => {
    it.each([
        ['a patch with a test', true, [{ op: 'replace', path: ['temperature'], value: 1 }, { op: 'test', path: ['temperature'], value: 1 }]],
        ['a patch with only replaces', false, [{ op: 'replace', path: ['temperature'], value: 1 }]],
        ['an empty patch', false, []],
        ['something that is not a patch', false, { op: 'test' }],
        ['entries that are not operations', false, ['test', null]],
    ])('%s is reported as %j', (_label, expected, operations) => {
        expect(patchReadsDatabase(operations)).toBe(expected)
    })
})

describe('applyDatabasePatch', () => {
    it('sets one nested field and leaves everything else untouched', () => {
        const db = makeDb()
        const chats = db.characters[0].chats

        const result = applyPatch(db, [{ op: 'replace', path: ['characters', 0, 'name'], value: 'Alicia' }])

        expect(result).toEqual({ characterIds: ['a'] })
        expect(db.characters[0].chats).toBe(chats)
        expect(db).toEqual({ ...makeDb(), characters: [{ ...makeCharacter('a', 'Alice'), name: 'Alicia' }, makeCharacter('b', 'Bob')] })
    })

    it('replaces a top-level value', () => {
        const db = makeDb()

        const result = applyPatch(db, [{ op: 'replace', path: ['temperature'], value: 70 }])

        expect(result).toEqual({ characterIds: [] })
        expect(db).toEqual({ ...makeDb(), temperature: 70 })
    })

    it('writes at any depth inside objects and arrays', () => {
        const db = makeDb()

        applyPatch(db, [
            { op: 'replace', path: ['seperateModels', 'memory'], value: 'new' },
            { op: 'replace', path: ['modules', 0, 'lorebook', 0, 'key'], value: 'changed' },
            { op: 'replace', path: ['enabledModules', 0], value: 'm2' },
        ])

        expect(db.seperateModels).toEqual({ memory: 'new', emotion: 'e', translate: 't', otherAx: 'o' })
        expect(db.modules[0].lorebook).toEqual([{ key: 'changed', content: 'c' }])
        expect(db.enabledModules).toEqual(['m2'])
    })

    it('creates a field that is missing on an existing object', () => {
        const db = makeDb()

        applyPatch(db, [{ op: 'replace', path: ['characters', 1, 'custom'], value: { enabled: true } }])

        expect(db.characters[1]).toEqual({ ...makeCharacter('b', 'Bob'), custom: { enabled: true } })
    })

    it('reports the old and the new character id when a whole character is replaced', () => {
        const db = makeDb()

        const result = applyPatch(db, [{ op: 'replace', path: ['characters', 0], value: makeCharacter('z', 'Zed') }])

        expect(result.characterIds.sort()).toEqual(['a', 'z'])
        expect(db.characters[0]).toEqual(makeCharacter('z', 'Zed'))
    })

    it('reports every old and new character id when the whole list is replaced', () => {
        const db = makeDb()

        const result = applyPatch(db, [{ op: 'replace', path: ['characters'], value: [makeCharacter('b', 'Bob'), makeCharacter('c', 'Cy')] }])

        expect(result.characterIds.sort()).toEqual(['a', 'b', 'c'])
    })

    it.each([
        ['a parent that does not exist', ['characters', 5, 'name']],
        ['a field of a value that is not an object', ['temperature', 'unit']],
        ['an array index that does not exist', ['enabledModules', 1]],
        ['a field name used on an array', ['characters', 'name']],
        ['a numeric string used as an array index', ['characters', '0', 'name']],
    ])('rejects %s before applying anything', (_label, path) => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'replace', path: ['seperateModels', 'memory'], value: 'new' },
            { op: 'replace', path, value: 'x' },
        ])).toThrow('cannot find')
        expect(db).toEqual(makeDb())
    })

    it.each([
        ['something that is not an array', { op: 'replace', path: ['temperature'], value: 1 }],
        ['an operation that is not an object', ['replace']],
        ['a missing path', [{ op: 'replace', value: 1 }]],
        ['an empty path', [{ op: 'replace', path: [], value: 1 }]],
        ['a negative index', [{ op: 'replace', path: ['characters', -1, 'name'], value: 'x' }]],
        ['a fractional index', [{ op: 'replace', path: ['characters', 0.5, 'name'], value: 'x' }]],
        ['a __proto__ segment', [{ op: 'replace', path: ['characters', 0, '__proto__'], value: { injected: true } }]],
        ['a constructor segment', [{ op: 'replace', path: ['characters', 0, 'constructor', 'prototype'], value: 1 }]],
        ['a path with a hole', [{ op: 'replace', path: structuredClone(['characters', , 'name']), value: 'x' }]],
        ['an unknown op', [{ op: 'remove', path: ['temperature'] }]],
        ['a replace without a value', [{ op: 'replace', path: ['temperature'] }]],
        ['a BigInt value', [{ op: 'replace', path: ['temperature'], value: BigInt(1) }]],
        ['a hole in the operations', structuredClone([{ op: 'replace', path: ['temperature'], value: 1 }, , ])],
    ])('rejects %s before applying anything', (_label, operations) => {
        const db = makeDb()

        expect(() => applyPatch(db, operations)).toThrow('patchDatabase')
        expect(db).toEqual(makeDb())
        expect(Object.getPrototypeOf(db.characters[0])).toBe(Object.prototype)
    })

    it('rejects keys outside the allowed list before applying anything', () => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'replace', path: ['temperature'], value: 90 },
            { op: 'replace', path: ['account', 'token'], value: 'stolen' },
        ])).toThrow('does not support "account"')
        expect(db).toEqual(makeDb())
    })

    it.each([
        ['a read-only key', ['plugins']],
        ['anything inside a read-only key', ['plugins', 0, 'enabled']],
        ['a read-only field', ['pluginCustomStorage', '_coldpluginIndex']],
        ['a key that holds a read-only field', ['pluginCustomStorage']],
    ])('refuses to write %s before applying anything', (_label, path) => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'replace', path: ['temperature'], value: 90 },
            { op: 'replace', path, value: {} },
        ])).toThrow('read-only')
        expect(db).toEqual(makeDb())
    })

    it('refuses to create a field whose name every object inherits, before applying anything', () => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'replace', path: ['temperature'], value: 90 },
            { op: 'replace', path: ['pluginCustomStorage', 'toString'], value: 'x' },
        ])).toThrow('cannot create')
        expect(db).toEqual(makeDb())
    })

    it('replaces a field with an inherited name when the object already has it', () => {
        const db = { ...makeDb(), pluginCustomStorage: { toString: 'old' } as Record<string, any> }

        applyPatch(db, [{ op: 'replace', path: ['pluginCustomStorage', 'toString'], value: 'new' }])

        expect(db.pluginCustomStorage).toEqual({ toString: 'new' })
    })

    it('writes a field next to a read-only one', () => {
        const db = makeDb()

        applyPatch(db, [{ op: 'replace', path: ['pluginCustomStorage', 'mine'], value: 'changed' }])

        expect(db.pluginCustomStorage).toEqual({ mine: 'changed', _coldpluginIndex: 'index' })
    })

    it('applies nothing when a test fails', () => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'replace', path: ['characters', 0, 'name'], value: 'Alicia' },
            { op: 'test', path: ['characters', 0, 'chaId'], value: 'someone-else' },
        ])).toThrow('test failed at "characters.0.chaId"')
        expect(db).toEqual(makeDb())
    })

    it('checks tests against the database as it was before the patch', () => {
        const db = makeDb()

        applyPatch(db, [
            { op: 'replace', path: ['characters', 0, 'name'], value: 'Alicia' },
            { op: 'test', path: ['characters', 0, 'name'], value: 'Alice' },
            { op: 'test', path: ['characters', 0, 'chats'], value: makeCharacter('a', 'Alice').chats },
        ])

        expect(db.characters[0].name).toBe('Alicia')
    })

    it('lets a test require that a field is missing', () => {
        const db = { ...makeDb(), characters: [makeCharacter('a', 'Alice'), makeColdStoredCharacter('b', 'Bob')] }
        const guardedRename = (index: number) => [
            { op: 'test', path: ['characters', index, 'coldstorage'], value: undefined },
            { op: 'replace', path: ['characters', index, 'name'], value: 'Renamed' },
        ]

        applyPatch(db, guardedRename(0))

        expect(db.characters[0].name).toBe('Renamed')
        expect(() => applyPatch(db, guardedRename(1))).toThrow('test failed')
        expect(db.characters[1]).toEqual(makeColdStoredCharacter('b', 'Bob'))
    })

    it('lets a test on the replaced value stop a patch computed from a placeholder after the character was restored', () => {
        const db = { ...makeDb(), characters: [makeColdStoredCharacter('a', 'Alice')] as Record<string, any>[] }
        const read = structuredClone(db.characters[0])
        db.characters[0] = { ...makeCharacter('a', 'Alice'), modules: ['keep'] }

        expect(() => applyPatch(db, [
            { op: 'test', path: ['characters', 0, 'chaId'], value: read.chaId },
            { op: 'test', path: ['characters', 0, 'modules'], value: read.modules },
            { op: 'replace', path: ['characters', 0, 'modules'], value: [...(read.modules ?? []), 'm1'] },
        ])).toThrow('test failed at "characters.0.modules"')
        expect(db.characters[0].modules).toEqual(['keep'])
    })

    it('rejects a test whose path cannot be followed instead of treating it as missing', () => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'test', path: ['characters', '0', 'coldstorage'], value: undefined },
            { op: 'replace', path: ['temperature'], value: 70 },
        ])).toThrow('cannot find')
        expect(db).toEqual(makeDb())
    })

    it('does not let a test read fields inherited from the prototype', () => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'test', path: ['characters', 0, 'toString'], value: undefined },
            { op: 'replace', path: ['temperature'], value: 70 },
        ])).not.toThrow()
        expect(db.temperature).toBe(70)
    })

    it('lets a test read a read-only key', () => {
        const db = makeDb()

        applyPatch(db, [
            { op: 'test', path: ['plugins', 0, 'name'], value: 'p' },
            { op: 'replace', path: ['temperature'], value: 70 },
        ])

        expect(db.temperature).toBe(70)
    })

    it.each([
        ['the same place twice', ['characters', 0, 'name'], ['characters', 0, 'name']],
        ['a place inside another write', ['characters', 0], ['characters', 0, 'name']],
        ['a place that holds another write', ['characters', 0, 'name'], ['characters']],
    ])('rejects writing %s before applying anything', (_label, first, second) => {
        const db = makeDb()

        expect(() => applyPatch(db, [
            { op: 'replace', path: first, value: [] },
            { op: 'replace', path: second, value: [] },
        ])).toThrow('already writes there')
        expect(db).toEqual(makeDb())
    })

    it('tells apart places whose paths only look alike when joined', () => {
        const db = { ...makeDb(), pluginCustomStorage: { a: { b: 1 }, 'a/b': 1, 'a"/"b': 1, '': { x: 1 }, x: 1 } as Record<string, any> }

        applyPatch(db, [
            { op: 'replace', path: ['pluginCustomStorage', 'a', 'b'], value: 2 },
            { op: 'replace', path: ['pluginCustomStorage', 'a/b'], value: 2 },
            { op: 'replace', path: ['pluginCustomStorage', 'a"/"b'], value: 2 },
            { op: 'replace', path: ['pluginCustomStorage', '', 'x'], value: 2 },
            { op: 'replace', path: ['pluginCustomStorage', 'x'], value: 2 },
        ])

        expect(db.pluginCustomStorage).toEqual({ a: { b: 2 }, 'a/b': 2, 'a"/"b': 2, '': { x: 2 }, x: 2 })
    })

    it('treats a number and the same digits as a field name as one place', () => {
        const db = { ...makeDb(), pluginCustomStorage: { 0: 'zero' } as Record<string, any> }

        expect(() => applyPatch(db, [
            { op: 'replace', path: ['pluginCustomStorage', 0], value: 'a' },
            { op: 'replace', path: ['pluginCustomStorage', '0'], value: 'b' },
        ])).toThrow('already writes there')
        expect(db.pluginCustomStorage).toEqual({ 0: 'zero' })
    })

    it('applies a patch with thousands of writes', () => {
        const entries = Array.from({ length: 20000 }, (_unused, index) => ({ key: `k${index}`, content: 'c' }))
        const db = { ...makeDb(), modules: [{ id: 'm1', name: 'Mod', lorebook: entries }] }

        applyPatch(db, entries.map((_entry, index) => {
            return { op: 'replace', path: ['modules', 0, 'lorebook', index, 'content'], value: 'changed' }
        }))

        expect(db.modules[0].lorebook.every((entry) => entry.content === 'changed')).toBe(true)
    })

    it('does not reach through a value that is neither a plain object nor an array', () => {
        const db = { ...makeDb(), temperature: new Map() }

        expect(() => applyPatch(db, [
            { op: 'replace', path: ['enabledModules'], value: [] },
            { op: 'replace', path: ['temperature', 'size'], value: 1 },
        ])).toThrow('cannot find')
        expect(db.enabledModules).toEqual(['m1'])
    })
})
