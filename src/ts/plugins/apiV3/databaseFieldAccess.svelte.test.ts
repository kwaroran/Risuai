import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { applyDatabasePatch, projectDbValue } from './databaseFieldAccess'

function makeDbState() {
    const db = $state({
        characters: [
            { chaId: 'a', name: 'Alice', modules: ['m0'], chats: [{ message: [{ role: 'user', data: 'hi' }] }] },
            { chaId: 'b', name: 'Bob', modules: [], chats: [] },
            { chaId: 'c', name: 'Cold', chats: [{ message: [{ role: 'char', data: '' }] }], chatPage: 0, coldstorage: 'cold-c' },
        ] as Record<string, any>[],
        modules: [{ id: 'm1', name: 'Mod', lorebook: [{ key: 'k' }] }] as Record<string, any>[],
    })
    return db
}

function readFiltered(db: ReturnType<typeof makeDbState>, filter: unknown) {
    const projected = projectDbValue('characters', db.characters, filter)
    return structuredClone($state.snapshot(projected.value)) as Record<string, any>[]
}

describe('projectDbValue on $state', () => {
    it('yields plain data that can be cloned across the sandbox boundary once snapshotted', () => {
        const db = makeDbState()

        expect(readFiltered(db, { include: { characters: ['name', 'modules'] } })).toEqual([
            { chaId: 'a', name: 'Alice', modules: ['m0'] },
            { chaId: 'b', name: 'Bob', modules: [] },
            { chaId: 'c', name: 'Cold', coldstorage: 'cold-c' },
        ])
    })
})

describe('applyDatabasePatch on $state', () => {
    it.each([
        { include: { characters: ['name', 'modules'] } },
        { exclude: { characters: ['chats'] } },
    ])('writes nothing when a filtered read is passed back unchanged: %o', (filter) => {
        const db = makeDbState()

        const result = applyDatabasePatch(db, { characters: readFiltered(db, filter) })

        expect(result).toEqual({ patched: [], missing: [], coldStored: [] })
    })

    it('writes only the changed fields into the state', () => {
        const db = makeDbState()
        const read = readFiltered(db, { include: { characters: ['name', 'modules'] } })
        read[0].modules.push('m1')
        read[2].name = 'Renamed while cold'

        const result = applyDatabasePatch(db, { characters: read })

        expect(result).toEqual({
            patched: [{ key: 'characters', id: 'a' }],
            missing: [],
            coldStored: [{ key: 'characters', id: 'c' }],
        })
        expect($state.snapshot(db.characters)).toEqual([
            { chaId: 'a', name: 'Alice', modules: ['m0', 'm1'], chats: [{ message: [{ role: 'user', data: 'hi' }] }] },
            { chaId: 'b', name: 'Bob', modules: [], chats: [] },
            { chaId: 'c', name: 'Cold', chats: [{ message: [{ role: 'char', data: '' }] }], chatPage: 0, coldstorage: 'cold-c' },
        ])
    })

    it('re-runs effects that read the patched key', () => {
        const db = makeDbState()
        let runs = 0
        const stop = $effect.root(() => {
            $effect(() => {
                $state.snapshot(db.modules)
                runs += 1
            })
        })
        flushSync()

        applyDatabasePatch(db, { modules: [{ id: 'm1', name: 'Renamed' }] })
        flushSync()
        stop()

        expect(runs).toBe(2)
    })
})
