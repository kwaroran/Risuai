import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { applyDatabasePatch, projectDbValue } from './databaseFieldAccess'

const patchOptions = {
    allowedKeys: ['characters', 'modules', 'temperature', 'seperateModels'],
    readOnlyPaths: [],
}

function makeDbState() {
    const db = $state({
        characters: [
            { chaId: 'a', name: 'Alice', modules: ['m0'], chats: [{ message: [{ role: 'user', data: 'hi' }] }] },
            { chaId: 'b', name: 'Bob', modules: [], chats: [] },
            { chaId: 'c', name: 'Cold', chats: [{ message: [{ role: 'char', data: '' }] }], chatPage: 0, coldstorage: 'cold-c' },
        ] as Record<string, any>[],
        modules: [{ id: 'm1', name: 'Mod', lorebook: [{ key: 'k' }] }] as Record<string, any>[],
        temperature: 80 as unknown,
        seperateModels: { memory: 'm', emotion: 'e', translate: 't', otherAx: 'o' },
    })
    return db
}

describe('projectDbValue on $state', () => {
    it('yields plain data that can be cloned across the sandbox boundary once snapshotted', () => {
        const db = makeDbState()

        const projected = projectDbValue('characters', db.characters, { include: { characters: ['name', 'modules'] } })

        expect(structuredClone($state.snapshot(projected.value))).toEqual([
            { chaId: 'a', name: 'Alice', modules: ['m0'] },
            { chaId: 'b', name: 'Bob', modules: [] },
            { chaId: 'c', name: 'Cold', coldstorage: 'cold-c' },
        ])
    })
})

describe('applyDatabasePatch on $state', () => {
    it('writes the given paths into the state and nothing else', () => {
        const db = makeDbState()

        const result = applyDatabasePatch(db, structuredClone([
            { op: 'test', path: ['characters', 0, 'chaId'], value: 'a' },
            { op: 'test', path: ['characters', 0, 'modules'], value: ['m0'] },
            { op: 'replace', path: ['characters', 0, 'modules'], value: ['m0', 'm1'] },
            { op: 'replace', path: ['seperateModels', 'memory'], value: 'new' },
            { op: 'replace', path: ['temperature'], value: 70 },
        ]), patchOptions)

        expect(result).toEqual({ characterIds: ['a'] })
        expect($state.snapshot(db)).toEqual({
            characters: [
                { chaId: 'a', name: 'Alice', modules: ['m0', 'm1'], chats: [{ message: [{ role: 'user', data: 'hi' }] }] },
                { chaId: 'b', name: 'Bob', modules: [], chats: [] },
                { chaId: 'c', name: 'Cold', chats: [{ message: [{ role: 'char', data: '' }] }], chatPage: 0, coldstorage: 'cold-c' },
            ],
            modules: [{ id: 'm1', name: 'Mod', lorebook: [{ key: 'k' }] }],
            temperature: 70,
            seperateModels: { memory: 'new', emotion: 'e', translate: 't', otherAx: 'o' },
        })
    })

    it('leaves the state untouched when a later operation is invalid', () => {
        const db = makeDbState()
        const before = $state.snapshot(db)

        expect(() => applyDatabasePatch(db, structuredClone([
            { op: 'replace', path: ['temperature'], value: 70 },
            { op: 'replace', path: ['characters', 9, 'name'], value: 'x' },
        ]), patchOptions)).toThrow('cannot find')
        expect($state.snapshot(db)).toEqual(before)
    })

    it('refuses to create a field the state would silently drop', () => {
        const db = makeDbState()
        const before = $state.snapshot(db)

        expect(() => applyDatabasePatch(db, structuredClone([
            { op: 'replace', path: ['temperature'], value: 70 },
            { op: 'replace', path: ['seperateModels', 'toString'], value: 'x' },
        ]), patchOptions)).toThrow('cannot create')
        expect($state.snapshot(db)).toEqual(before)
    })

    it('stores every field it reports as written', () => {
        const db = makeDbState()

        applyDatabasePatch(db, structuredClone([
            { op: 'replace', path: ['seperateModels', 'custom'], value: 'added' },
            { op: 'replace', path: ['characters', 1, 'valueOfCustom'], value: 1 },
        ]), patchOptions)

        expect($state.snapshot(db.seperateModels)).toEqual({ memory: 'm', emotion: 'e', translate: 't', otherAx: 'o', custom: 'added' })
        expect($state.snapshot(db.characters[1])).toEqual({ chaId: 'b', name: 'Bob', modules: [], chats: [], valueOfCustom: 1 })
    })

    it('does not reach through a Map held in the state', () => {
        const db = makeDbState()
        applyDatabasePatch(db, structuredClone([{ op: 'replace', path: ['temperature'], value: new Map() }]), patchOptions)

        expect(() => applyDatabasePatch(db, structuredClone([
            { op: 'replace', path: ['seperateModels', 'memory'], value: 'new' },
            { op: 'replace', path: ['temperature', 'size'], value: 1 },
        ]), patchOptions)).toThrow('cannot find')
        expect(db.seperateModels.memory).toBe('m')
    })

    it('re-runs effects that read the written key', () => {
        const db = makeDbState()
        let runs = 0
        const stop = $effect.root(() => {
            $effect(() => {
                $state.snapshot(db.modules)
                runs += 1
            })
        })
        flushSync()

        applyDatabasePatch(db, [{ op: 'replace', path: ['modules', 0, 'name'], value: 'Renamed' }], patchOptions)
        flushSync()
        stop()

        expect(runs).toBe(2)
    })
})
