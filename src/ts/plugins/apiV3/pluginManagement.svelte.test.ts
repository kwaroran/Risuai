import { describe, expect, it } from 'vitest'
import type { RisuPlugin } from '../plugins.svelte'
import {
    listPlugins,
    removePluginEntry,
    removePluginsNamed,
    reorderPlugins,
    setPluginArgument,
    setPluginEnabled,
} from './pluginManagement'

const makePlugin = (name: string, overrides: Partial<RisuPlugin> = {}): RisuPlugin => ({
    name,
    script: `//@name ${name}\n//@api 3.0`,
    arguments: { value: 'string' },
    realArg: { value: '' },
    version: '3.0',
    customLink: [],
    argMeta: {},
    enabled: true,
    ...overrides,
})

const makeDatabase = (plugins: RisuPlugin[], currentPluginProvider = '') => {
    const db = $state({ plugins, currentPluginProvider })
    return db
}

const names = (db: { plugins: RisuPlugin[] }) => db.plugins.map((plugin) => plugin.name)

describe('plugin management on reactive state', () => {
    it('lists the plugins as data that can be posted to the plugin sandbox', () => {
        const db = makeDatabase([makePlugin('a', { displayName: 'Plugin A' }), makePlugin('b', { enabled: false })])

        expect(structuredClone(listPlugins(db.plugins))).toEqual([
            { name: 'a', displayName: 'Plugin A', version: '3.0', enabled: true },
            { name: 'b', displayName: undefined, version: '3.0', enabled: false },
        ])
    })

    it('removes the entry it was given after the list was reordered', () => {
        const db = makeDatabase([makePlugin('a'), makePlugin('b'), makePlugin('c')])
        const confirmed = db.plugins[1]

        db.plugins = reorderPlugins(db.plugins, ['c', 'a', 'b'])

        expect(removePluginEntry(db, confirmed)).toBe(true)
        expect(names(db)).toEqual(['c', 'a'])
    })

    it('removes the plugin after an update replaced its entry', () => {
        const db = makeDatabase([makePlugin('a'), makePlugin('b'), makePlugin('c')])
        const confirmed = db.plugins[1]

        db.plugins[1] = makePlugin('b', { script: 'updated' })

        expect(removePluginEntry(db, confirmed)).toBe(true)
        expect(names(db)).toEqual(['a', 'c'])
    })

    it('removes nothing when the entry it was given is already gone', () => {
        const db = makeDatabase([makePlugin('a'), makePlugin('b'), makePlugin('c')])
        const confirmed = db.plugins[2]

        expect(removePluginsNamed(db, 'c')).toBe(true)

        expect(removePluginEntry(db, confirmed)).toBe(false)
        expect(names(db)).toEqual(['a', 'b'])
    })

    it('removes plugins by name and clears the selected plugin provider', () => {
        const db = makeDatabase([makePlugin('a'), makePlugin('b'), makePlugin('a')], 'a')

        expect(removePluginsNamed(db, 'a')).toBe(true)
        expect($state.snapshot(db)).toEqual({ plugins: [makePlugin('b')], currentPluginProvider: '' })
    })

    it('stores an argument named like a built-in object member', () => {
        const db = makeDatabase([
            makePlugin('a', { arguments: { constructor: 'string' as const, toString: 'string' as const }, realArg: {} }),
            makePlugin('b', { arguments: { constructor: 'string' as const }, realArg: undefined }),
        ])

        expect(setPluginArgument(db.plugins, 'a', 'constructor', 'x')).toBe(true)
        expect(setPluginArgument(db.plugins, 'a', 'toString', 'y')).toBe(true)
        expect(setPluginArgument(db.plugins, 'b', 'constructor', 'z')).toBe(true)

        expect($state.snapshot(db.plugins[0].realArg)).toEqual({ constructor: 'x', toString: 'y' })
        expect($state.snapshot(db.plugins[1].realArg)).toEqual({ constructor: 'z' })
    })

    it('keeps the other arguments when one is set', () => {
        const db = makeDatabase([
            makePlugin('a', { arguments: { key: 'string', count: 'int' }, realArg: { key: 'old', count: 1 } }),
        ])

        expect(setPluginArgument(db.plugins, 'a', 'count', 2)).toBe(true)
        expect($state.snapshot(db.plugins[0].realArg)).toEqual({ key: 'old', count: 2 })
    })

    it('enables and reorders the stored entries', () => {
        const db = makeDatabase([makePlugin('a', { enabled: false }), makePlugin('b')])

        expect(setPluginEnabled(db.plugins, 'a', true)).toBe(true)
        db.plugins = reorderPlugins(db.plugins, ['b', 'a'])

        expect($state.snapshot(db.plugins).map((plugin) => [plugin.name, plugin.enabled])).toEqual([['b', true], ['a', true]])
    })
})
