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

describe('listPlugins', () => {
    it('lists the name, display name, API version and enabled state in the plugin order', () => {
        const plugins = [
            makePlugin('a', { displayName: 'Plugin A' }),
            makePlugin('legacy', { version: '2.1', enabled: false }),
        ]

        expect(listPlugins(plugins)).toEqual([
            { name: 'a', displayName: 'Plugin A', version: '3.0', enabled: true },
            { name: 'legacy', displayName: undefined, version: '2.1', enabled: false },
        ])
    })

    it('leaves out the script and the arguments', () => {
        const plugins = [makePlugin('a', { realArg: { value: 'secret' } })]

        expect(Object.keys(listPlugins(plugins)[0]).sort()).toEqual(['displayName', 'enabled', 'name', 'version'])
    })

    it('reports a plugin that has no enabled flag as disabled', () => {
        const plugins = [makePlugin('a', { enabled: undefined })]

        expect(listPlugins(plugins)[0].enabled).toBe(false)
    })

    it('gives the names reorderPlugins accepts, also when plugins share a name', () => {
        const plugins = [makePlugin('a'), makePlugin('b'), makePlugin('a')]
        const names = listPlugins(plugins).map((plugin) => plugin.name)

        expect(names).toEqual(['a', 'b', 'a'])
        expect(reorderPlugins(plugins, names)).toEqual(plugins)
    })
})

describe('setPluginEnabled', () => {
    it('disables and enables an API 3.0 plugin', () => {
        const plugins = [makePlugin('a'), makePlugin('b')]

        expect(setPluginEnabled(plugins, 'b', false)).toBe(true)
        expect(plugins.map((plugin) => plugin.enabled)).toEqual([true, false])

        expect(setPluginEnabled(plugins, 'b', true)).toBe(true)
        expect(plugins.map((plugin) => plugin.enabled)).toEqual([true, true])
    })

    it('reports false for a plugin that is not installed', () => {
        const plugins = [makePlugin('a')]

        expect(setPluginEnabled(plugins, 'missing', false)).toBe(false)
        expect(plugins[0].enabled).toBe(true)
    })

    it('enables and disables a plugin of an older API version', () => {
        const plugins = [makePlugin('legacy', { version: '2.1', enabled: false })]

        expect(setPluginEnabled(plugins, 'legacy', true)).toBe(true)
        expect(plugins[0].enabled).toBe(true)

        expect(setPluginEnabled(plugins, 'legacy', false)).toBe(true)
        expect(plugins[0].enabled).toBe(false)
    })

    it('reports true when the plugin is already in the requested state', () => {
        const plugins = [makePlugin('a')]

        expect(setPluginEnabled(plugins, 'a', true)).toBe(true)
        expect(plugins[0].enabled).toBe(true)
    })

    it('enables every plugin sharing a name, whatever their API versions', () => {
        const plugins = [
            makePlugin('a', { enabled: false }),
            makePlugin('a', { version: '2.1', enabled: false }),
        ]

        expect(setPluginEnabled(plugins, 'a', true)).toBe(true)
        expect(plugins.map((plugin) => plugin.enabled)).toEqual([true, true])
    })

    it('applies to every installed plugin with the name', () => {
        const plugins = [makePlugin('a'), makePlugin('b'), makePlugin('a')]

        expect(setPluginEnabled(plugins, 'a', false)).toBe(true)
        expect(plugins.map((plugin) => plugin.enabled)).toEqual([false, true, false])
    })

    it('rejects arguments of the wrong type', () => {
        const plugins = [makePlugin('a')]

        expect(() => setPluginEnabled(plugins, 'a', 'false' as unknown as boolean)).toThrow('enabled must be a boolean')
        expect(() => setPluginEnabled(plugins, 1 as unknown as string, false)).toThrow('name must be a string')
        expect(plugins[0].enabled).toBe(true)
    })
})

describe('reorderPlugins', () => {
    it('returns the plugins in the requested order without modifying the given list', () => {
        const [a, b, c] = [makePlugin('a'), makePlugin('b'), makePlugin('c')]
        const plugins = [a, b, c]

        const ordered = reorderPlugins(plugins, ['c', 'a', 'b'])

        expect(ordered).toEqual([c, a, b])
        expect(ordered?.[0]).toBe(c)
        expect(plugins).toEqual([a, b, c])
    })

    it('returns null unless the names are exactly the installed plugins', () => {
        const plugins = [makePlugin('a'), makePlugin('b')]

        expect(reorderPlugins(plugins, ['a'])).toBeNull()
        expect(reorderPlugins(plugins, ['a', 'b', 'c'])).toBeNull()
        expect(reorderPlugins(plugins, ['a', 'c'])).toBeNull()
        expect(reorderPlugins(plugins, ['a', 'a'])).toBeNull()
    })

    it('keeps the relative order of plugins sharing a name', () => {
        const first = makePlugin('a', { script: 'first' })
        const second = makePlugin('a', { script: 'second' })
        const b = makePlugin('b')

        const ordered = reorderPlugins([first, b, second], ['b', 'a', 'a'])

        expect(ordered?.map((plugin) => plugin.script)).toEqual([b.script, 'first', 'second'])
    })

    it('rejects names that are not an array of strings', () => {
        const plugins = [makePlugin('a')]

        expect(() => reorderPlugins(plugins, 'a' as unknown as string[])).toThrow('names must be an array of strings')
        expect(() => reorderPlugins(plugins, [1] as unknown as string[])).toThrow('names[] must be a string')
    })
})

describe('removePluginEntry', () => {
    it('removes the given entry', () => {
        const [a, b, c] = [makePlugin('a'), makePlugin('b'), makePlugin('c')]
        const db = { plugins: [a, b, c], currentPluginProvider: '' }

        expect(removePluginEntry(db, b)).toBe(true)
        expect(db.plugins).toEqual([a, c])
    })

    it('leaves the list untouched when the plugin is no longer installed', () => {
        const [a, b] = [makePlugin('a'), makePlugin('b')]
        const db = { plugins: [a, b], currentPluginProvider: '' }

        expect(removePluginEntry(db, makePlugin('removed'))).toBe(false)
        expect(db.plugins).toEqual([a, b])
        expect(removePluginEntry({}, a)).toBe(false)
    })

    it('removes the plugin that replaced the given entry', () => {
        const [a, b, c] = [makePlugin('a'), makePlugin('b'), makePlugin('c')]
        const db = { plugins: [a, b, c], currentPluginProvider: 'b' }
        db.plugins[1] = makePlugin('b', { script: 'updated' })

        expect(removePluginEntry(db, b)).toBe(true)
        expect(db.plugins).toEqual([a, c])
        expect(db.currentPluginProvider).toBe('')
    })

    it('removes the given copy when several plugins share its name', () => {
        const first = makePlugin('a', { script: 'first' })
        const second = makePlugin('a', { script: 'second' })
        const b = makePlugin('b')
        const db = { plugins: [first, b, second], currentPluginProvider: '' }

        expect(removePluginEntry(db, second)).toBe(true)
        expect(db.plugins).toEqual([first, b])
    })

    it('clears the selected plugin provider only when it is the removed plugin', () => {
        const [a, b] = [makePlugin('a'), makePlugin('b')]
        const db = { plugins: [a, b], currentPluginProvider: 'b' }

        removePluginEntry(db, a)
        expect(db.currentPluginProvider).toBe('b')

        removePluginEntry(db, b)
        expect(db.currentPluginProvider).toBe('')
    })
})

describe('removePluginsNamed', () => {
    it('removes every installed plugin with the name', () => {
        const b = makePlugin('b')
        const db = { plugins: [makePlugin('a'), b, makePlugin('a')], currentPluginProvider: 'a' }

        expect(removePluginsNamed(db, 'a')).toBe(true)
        expect(db.plugins).toEqual([b])
        expect(db.currentPluginProvider).toBe('')
    })

    it('reports false for a plugin that is not installed', () => {
        const a = makePlugin('a')
        const db = { plugins: [a], currentPluginProvider: 'a' }

        expect(removePluginsNamed(db, 'missing')).toBe(false)
        expect(removePluginsNamed({}, 'a')).toBe(false)
        expect(db.plugins).toEqual([a])
        expect(db.currentPluginProvider).toBe('a')
    })

    it('rejects a name that is not a string', () => {
        const db = { plugins: [makePlugin('a')] }

        expect(() => removePluginsNamed(db, 1 as unknown as string)).toThrow('name must be a string')
        expect(db.plugins).toHaveLength(1)
    })
})

describe('setPluginArgument', () => {
    it('sets an argument the plugin declares', () => {
        const plugins = [
            makePlugin('a', { arguments: { key: 'string', count: 'int' }, realArg: { key: 'old', count: 1 } }),
            makePlugin('b'),
        ]

        expect(setPluginArgument(plugins, 'a', 'key', 'new')).toBe(true)
        expect(setPluginArgument(plugins, 'a', 'count', 2)).toBe(true)
        expect(plugins[0].realArg).toEqual({ key: 'new', count: 2 })
        expect(plugins[1].realArg).toEqual({ value: '' })
    })

    it('reports false for an argument the plugin does not declare or a plugin that is not installed', () => {
        const plugins = [makePlugin('a')]

        expect(setPluginArgument(plugins, 'a', 'undeclared', 'x')).toBe(false)
        expect(setPluginArgument(plugins, 'a', 'toString', 'x')).toBe(false)
        expect(setPluginArgument(plugins, 'missing', 'value', 'x')).toBe(false)
        expect(plugins[0].realArg).toEqual({ value: '' })
    })

    it('stores the value on a plugin entry that has no stored arguments yet', () => {
        const plugins = [makePlugin('a', { realArg: undefined })]

        expect(setPluginArgument(plugins, 'a', 'value', 'x')).toBe(true)
        expect(plugins[0].realArg).toEqual({ value: 'x' })
    })

    it('rejects a value that is neither a string nor a number', () => {
        const plugins = [makePlugin('a')]

        expect(() => setPluginArgument(plugins, 'a', 'value', { nested: true } as unknown as string)).toThrow('value must be a string or a number')
        expect(() => setPluginArgument(plugins, 'a', 1 as unknown as string, 'x')).toThrow('key must be a string')
        expect(plugins[0].realArg).toEqual({ value: '' })
    })
})
