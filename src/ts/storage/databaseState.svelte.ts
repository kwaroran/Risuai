import type { Database } from './database.svelte'

type DatabaseUpdatePathKey = string | number | symbol

export interface DatabaseUpdateInfo {
    path: DatabaseUpdatePathKey[]
    value: unknown
    oldValue: unknown
    type: 'set' | 'delete'
}

const databaseUpdateListeners = new Set<(info: DatabaseUpdateInfo) => void>()
const dbProxyInstances = new WeakSet<object>()
const mutableDBState = $state({ db: {} as Database })

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

function createDatabaseProxy<T>(target: T, path: DatabaseUpdatePathKey[] = []): T {
    if (!isProxyableDatabaseValue(target) || dbProxyInstances.has(target)) {
        return target
    }

    const childProxyCache = new Map<PropertyKey, { value: object, proxy: object }>()
    const proxy = new Proxy(target, {
        get(obj, prop, receiver) {
            const value = Reflect.get(obj, prop, receiver)
            if (isProxyableDatabaseValue(value)) {
                const cached = childProxyCache.get(prop)
                if (cached?.value === value) {
                    return cached.proxy
                }
                const childProxy = createDatabaseProxy(value, [...path, normalizePathKey(obj, prop)])
                childProxyCache.set(prop, { value, proxy: childProxy })
                return childProxy
            }
            return value
        },
        set(obj, prop, value, receiver) {
            const oldValue = Reflect.get(obj, prop, receiver)
            const truncatedEntries = Array.isArray(obj) && prop === 'length' &&
                typeof oldValue === 'number' && typeof value === 'number' &&
                Number.isInteger(value) && value >= 0 && value < oldValue
                ? Reflect.ownKeys(obj)
                    .filter((key): key is string => typeof key === 'string' && /^\d+$/.test(key) && Number(key) >= value)
                    .map((key) => ({ index: Number(key), oldValue: Reflect.get(obj, key) }))
                    .sort((a, b) => b.index - a.index)
                : []
            const result = Reflect.set(obj, prop, value, receiver)
            if (result && oldValue !== value) {
                childProxyCache.delete(prop)
                for (const entry of truncatedEntries) {
                    childProxyCache.delete(String(entry.index))
                    emitDatabaseUpdate({
                        path: [...path, entry.index],
                        value: undefined,
                        oldValue: entry.oldValue,
                        type: 'delete',
                    })
                }
                emitDatabaseUpdate({ path: [...path, normalizePathKey(obj, prop)], value, oldValue, type: 'set' })
            }
            return result
        },
        deleteProperty(obj, prop) {
            const oldValue = Reflect.get(obj, prop)
            const result = Reflect.deleteProperty(obj, prop)
            if (result) {
                childProxyCache.delete(prop)
                emitDatabaseUpdate({ path: [...path, normalizePathKey(obj, prop)], value: undefined, oldValue, type: 'delete' })
            }
            return result
        },
    })

    dbProxyInstances.add(proxy)
    return proxy
}

/** Subscribe to successful database property writes and deletions. */
export function onDatabaseUpdate(listener: (info: DatabaseUpdateInfo) => void) {
    databaseUpdateListeners.add(listener)
    return () => databaseUpdateListeners.delete(listener)
}

/** Replace the database while preserving the Svelte -> database proxy invariant. */
export function setDatabaseLite(data: Database) {
    mutableDBState.db = data
    mutableDBState.db = createDatabaseProxy(mutableDBState.db)
}
