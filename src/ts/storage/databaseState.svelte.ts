import type { Database } from './database.svelte'

type DatabaseUpdatePathKey = string | number | symbol

export interface DatabaseUpdateInfo {
    path: DatabaseUpdatePathKey[]
    value: unknown
    oldValue: unknown
    type: 'set' | 'delete'
}

const databaseUpdateListeners = new Set<(info: DatabaseUpdateInfo) => void>()
const mutableDBState = $state({ db: {} as Database })

interface DatabaseProxyMetadata {
    target: object
    parent: DatabaseProxyMetadata | null
    key: PropertyKey | null
    children: Map<PropertyKey, { target: object, proxy: object }>
}

const databaseProxyMetadata = new WeakMap<object, DatabaseProxyMetadata>()
let activeRoot: DatabaseProxyMetadata | null = null

export const DBState: { readonly db: Database } = mutableDBState

function emitDatabaseUpdate(info: DatabaseUpdateInfo) {
    for (const listener of databaseUpdateListeners) {
        try {
            listener(info)
        } catch (error) {
            console.error(error)
        }
    }
}

function normalizePathKey(target: object, prop: PropertyKey): DatabaseUpdatePathKey {
    if (Array.isArray(target) && typeof prop === 'string' && /^\d+$/.test(prop)) {
        return Number(prop)
    }
    return prop
}

function isProxyableDatabaseValue(value: unknown): value is object {
    if (Array.isArray(value)) {
        return true
    }
    if (!value || typeof value !== 'object') {
        return false
    }
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function unwrapDatabaseProxy<T>(value: T): T {
    if (!value || typeof value !== 'object') {
        return value
    }
    return (databaseProxyMetadata.get(value)?.target ?? value) as T
}

function resolveProxyPath(metadata: DatabaseProxyMetadata): DatabaseUpdatePathKey[] | null {
    const chain: DatabaseProxyMetadata[] = []
    let root = metadata
    while (root.parent) {
        chain.push(root)
        root = root.parent
    }
    if (root !== activeRoot) {
        return null
    }

    const path: DatabaseUpdatePathKey[] = []
    for (const child of chain.reverse()) {
        const parent = child.parent!
        let key = child.key
        if (key === null || unwrapDatabaseProxy(Reflect.get(parent.target, key)) !== child.target) {
            key = Reflect.ownKeys(parent.target).find((candidate) =>
                unwrapDatabaseProxy(Reflect.get(parent.target, candidate)) === child.target
            ) ?? null
            if (key === null) {
                return null
            }
            child.key = key
        }
        path.push(normalizePathKey(parent.target, key))
    }
    return path
}

function createDatabaseProxy<T>(target: T, parent: DatabaseProxyMetadata | null = null, key: PropertyKey | null = null): T {
    target = unwrapDatabaseProxy(target)
    if (!isProxyableDatabaseValue(target)) {
        return target
    }

    const metadata: DatabaseProxyMetadata = { target, parent, key, children: new Map() }
    const proxy = new Proxy(target, {
        get(obj, prop, receiver) {
            const value = unwrapDatabaseProxy(Reflect.get(obj, prop, receiver))
            if (isProxyableDatabaseValue(value)) {
                const cached = metadata.children.get(prop)
                if (cached?.target === value) {
                    return cached.proxy
                }
                const childProxy = createDatabaseProxy(value, metadata, prop)
                metadata.children.set(prop, { target: value, proxy: childProxy })
                return childProxy
            }
            return value
        },
        set(obj, prop, value, receiver) {
            const oldValue = unwrapDatabaseProxy(Reflect.get(obj, prop, receiver))
            const newValue = unwrapDatabaseProxy(value)
            const truncatedEntries = Array.isArray(obj) && prop === 'length' &&
                typeof oldValue === 'number' && typeof value === 'number' &&
                Number.isInteger(value) && value >= 0 && value < oldValue
                ? Reflect.ownKeys(obj)
                    .filter((key): key is string => typeof key === 'string' && /^\d+$/.test(key) && Number(key) >= value)
                    .map((key) => ({ index: Number(key), oldValue: Reflect.get(obj, key) }))
                    .sort((a, b) => b.index - a.index)
                : []
            const result = Reflect.set(obj, prop, newValue, receiver)
            if (result && !Object.is(oldValue, newValue)) {
                metadata.children.delete(prop)
                const path = resolveProxyPath(metadata)
                if (path === null) {
                    return result
                }
                for (const entry of truncatedEntries) {
                    metadata.children.delete(String(entry.index))
                    emitDatabaseUpdate({
                        path: [...path, entry.index],
                        value: undefined,
                        oldValue: entry.oldValue,
                        type: 'delete',
                    })
                }
                emitDatabaseUpdate({ path: [...path, normalizePathKey(obj, prop)], value: newValue, oldValue, type: 'set' })
            }
            return result
        },
        deleteProperty(obj, prop) {
            const existed = Object.prototype.hasOwnProperty.call(obj, prop)
            const oldValue = unwrapDatabaseProxy(Reflect.get(obj, prop))
            const result = Reflect.deleteProperty(obj, prop)
            if (result && existed) {
                metadata.children.delete(prop)
                const path = resolveProxyPath(metadata)
                if (path !== null) {
                    emitDatabaseUpdate({ path: [...path, normalizePathKey(obj, prop)], value: undefined, oldValue, type: 'delete' })
                }
            }
            return result
        },
    })

    databaseProxyMetadata.set(proxy, metadata)
    return proxy
}

/** Subscribe to successful database property writes and deletions. */
export function onDatabaseUpdate(listener: (info: DatabaseUpdateInfo) => void) {
    databaseUpdateListeners.add(listener)
    return () => databaseUpdateListeners.delete(listener)
}

/** Replace the database while preserving the Svelte -> database proxy invariant. */
export function setDatabaseLite(data: Database) {
    if (unwrapDatabaseProxy(data) === unwrapDatabaseProxy(DBState.db)) {
        return
    }

    const oldValue = DBState.db
    mutableDBState.db = unwrapDatabaseProxy(data)
    const database = createDatabaseProxy(mutableDBState.db)
    activeRoot = databaseProxyMetadata.get(database) ?? null
    mutableDBState.db = database
    emitDatabaseUpdate({ path: [], value: DBState.db, oldValue, type: 'set' })
}
