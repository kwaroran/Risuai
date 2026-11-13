import type { RisuPlugin } from "../plugins.svelte"

const requireString = (value: unknown, label: string) => {
    if (typeof value !== 'string') {
        throw new Error(`${label} must be a string`)
    }
}

export type InstalledPluginInfo = {
    name: string
    displayName?: string
    version?: RisuPlugin['version']
    enabled: boolean
}

export function listPlugins(plugins: RisuPlugin[]): InstalledPluginInfo[] {
    return plugins.map((plugin) => ({
        name: plugin.name,
        displayName: plugin.displayName,
        version: plugin.version,
        enabled: Boolean(plugin.enabled),
    }))
}

export function setPluginEnabled(plugins: RisuPlugin[], name: string, enabled: boolean): boolean {
    requireString(name, 'name')
    if (typeof enabled !== 'boolean') {
        throw new Error('enabled must be a boolean')
    }

    const targets = plugins.filter((plugin) => plugin.name === name)
    if (targets.length === 0) {
        return false
    }

    for (const plugin of targets) {
        plugin.enabled = enabled
    }
    return true
}

export function reorderPlugins(plugins: RisuPlugin[], names: string[]): RisuPlugin[] | null {
    if (!Array.isArray(names)) {
        throw new Error('names must be an array of strings')
    }
    for (const name of names) {
        requireString(name, 'names[]')
    }

    if (names.length !== plugins.length) {
        return null
    }

    const remaining = new Map<string, RisuPlugin[]>()
    for (const plugin of plugins) {
        const sameName = remaining.get(plugin.name)
        if (sameName) {
            sameName.push(plugin)
        }
        else {
            remaining.set(plugin.name, [plugin])
        }
    }

    const ordered: RisuPlugin[] = []
    for (const name of names) {
        const plugin = remaining.get(name)?.shift()
        if (!plugin) {
            return null
        }
        ordered.push(plugin)
    }
    return ordered
}

type PluginDatabase = {
    plugins?: RisuPlugin[]
    currentPluginProvider?: string
}

export function removePluginEntry(db: PluginDatabase, plugin: RisuPlugin): boolean {
    const plugins = db.plugins ?? []
    let index = plugins.indexOf(plugin)
    if (index === -1) {
        index = plugins.findIndex((entry) => entry.name === plugin.name)
    }
    if (index === -1) {
        return false
    }

    if (db.currentPluginProvider === plugin.name) {
        db.currentPluginProvider = ''
    }
    plugins.splice(index, 1)
    return true
}

export function removePluginsNamed(db: PluginDatabase, name: string): boolean {
    requireString(name, 'name')

    const targets = (db.plugins ?? []).filter((plugin) => plugin.name === name)
    for (const plugin of targets) {
        removePluginEntry(db, plugin)
    }
    return targets.length > 0
}

export function setPluginArgument(plugins: RisuPlugin[], name: string, key: string, value: string | number): boolean {
    requireString(name, 'name')
    requireString(key, 'key')
    if (typeof value !== 'string' && typeof value !== 'number') {
        throw new Error('value must be a string or a number')
    }

    const targets = plugins.filter((plugin) => plugin.name === name && Object.hasOwn(plugin.arguments ?? {}, key))
    if (targets.length === 0) {
        return false
    }

    for (const plugin of targets) {
        plugin.realArg = { ...plugin.realArg, [key]: value }
    }
    return true
}
