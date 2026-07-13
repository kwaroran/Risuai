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

type DatabaseProxyListener = (info: DatabaseUpdateInfo) => void

interface DatabaseProxyChild {
    state: DatabaseProxyState
    unsubscribe?: () => void
}

// Database values must form an acyclic, JSON-compatible graph. Shared targets
// are supported, but cycles are invalid for both event propagation and saving.
interface DatabaseProxyState {
    target: object
    proxy: object
    listeners: Set<DatabaseProxyListener>
    children: Map<PropertyKey, DatabaseProxyChild>
}

const databaseProxyStates = new WeakMap<object, DatabaseProxyState>()
const databaseProxyCache = new WeakMap<object, DatabaseProxyState>()
let unsubscribeActiveRoot: (() => void) | undefined

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
    return (databaseProxyStates.get(value)?.target ?? value) as T
}

function notifyDatabaseProxy(state: DatabaseProxyState, info: DatabaseUpdateInfo) {
    for (const listener of state.listeners) {
        listener(info)
    }
}

function subscribeDatabaseProxyChild(state: DatabaseProxyState, prop: PropertyKey, child: DatabaseProxyChild) {
    child.unsubscribe = subscribeDatabaseProxy(child.state, (info) => {
        notifyDatabaseProxy(state, {
            ...info,
            path: [normalizePathKey(state.target, prop), ...info.path],
        })
    })
}

function subscribeDatabaseProxy(state: DatabaseProxyState, listener: DatabaseProxyListener) {
    const activateChildren = state.listeners.size === 0
    state.listeners.add(listener)

    if (activateChildren) {
        for (const [prop, child] of state.children) {
            subscribeDatabaseProxyChild(state, prop, child)
        }
    }

    return () => {
        if (!state.listeners.delete(listener) || state.listeners.size !== 0) {
            return
        }
        for (const child of state.children.values()) {
            child.unsubscribe?.()
            child.unsubscribe = undefined
        }
    }
}

function removeDatabaseProxyChild(state: DatabaseProxyState, prop: PropertyKey) {
    const child = state.children.get(prop)
    if (child) {
        state.children.delete(prop)
        child.unsubscribe?.()
    }
}

function addDatabaseProxyChild(state: DatabaseProxyState, prop: PropertyKey, value: unknown) {
    removeDatabaseProxyChild(state, prop)
    const childProxy = createDatabaseProxy(unwrapDatabaseProxy(value))
    if (!isProxyableDatabaseValue(childProxy)) {
        return
    }

    const childState = databaseProxyStates.get(childProxy)
    if (!childState) {
        return
    }

    const child: DatabaseProxyChild = { state: childState }
    state.children.set(prop, child)
    if (state.listeners.size !== 0) {
        subscribeDatabaseProxyChild(state, prop, child)
    }
}

function readDatabaseProxyChild(target: object, prop: PropertyKey, receiver: object = target) {
    let value = Reflect.get(target, prop, receiver)
    if (value && typeof value === 'object') {
        const childState = databaseProxyStates.get(value)
        if (childState) {
            // A new plain container may contain a retained database proxy. Keep
            // the Svelte target in state so tracking proxies are never persisted.
            Reflect.set(target, prop, childState.target, target)
            value = Reflect.get(target, prop, receiver)
        }
    }
    return unwrapDatabaseProxy(value)
}

function createDatabaseProxy<T>(target: T): T {
    target = unwrapDatabaseProxy(target)
    if (!isProxyableDatabaseValue(target)) {
        return target
    }

    const cached = databaseProxyCache.get(target)
    if (cached) {
        return cached.proxy as T
    }

    let state: DatabaseProxyState
    const proxy = new Proxy(target, {
        get(obj, prop, receiver) {
            const value = readDatabaseProxyChild(obj, prop, receiver)
            if (!isProxyableDatabaseValue(value)) {
                removeDatabaseProxyChild(state, prop)
                return value
            }

            const child = state.children.get(prop)
            if (child?.state.target !== value) {
                addDatabaseProxyChild(state, prop, value)
            }
            return state.children.get(prop)?.state.proxy ?? value
        },
        set(obj, prop, value, receiver) {
            const oldValue = readDatabaseProxyChild(obj, prop, receiver)
            const newValue = unwrapDatabaseProxy(value)
            const truncatedEntries = Array.isArray(obj) && prop === 'length' &&
                typeof oldValue === 'number' && typeof value === 'number' &&
                Number.isInteger(value) && value >= 0 && value < oldValue
                ? Reflect.ownKeys(obj)
                    .filter((key): key is string => typeof key === 'string' && /^\d+$/.test(key) && Number(key) >= value)
                    .map((key) => ({ index: Number(key), oldValue: readDatabaseProxyChild(obj, key) }))
                    .sort((a, b) => b.index - a.index)
                : []
            const result = Reflect.set(obj, prop, newValue, receiver)
            const assignedValue = result ? readDatabaseProxyChild(obj, prop, receiver) : oldValue
            if (result && !Object.is(oldValue, assignedValue)) {
                addDatabaseProxyChild(state, prop, assignedValue)
                for (const entry of truncatedEntries) {
                    removeDatabaseProxyChild(state, String(entry.index))
                    notifyDatabaseProxy(state, {
                        path: [entry.index],
                        value: undefined,
                        oldValue: entry.oldValue,
                        type: 'delete',
                    })
                }
                notifyDatabaseProxy(state, {
                    path: [normalizePathKey(obj, prop)],
                    value: assignedValue,
                    oldValue,
                    type: 'set',
                })
            }
            return result
        },
        deleteProperty(obj, prop) {
            const existed = Object.prototype.hasOwnProperty.call(obj, prop)
            const oldValue = readDatabaseProxyChild(obj, prop)
            const result = Reflect.deleteProperty(obj, prop)
            if (result && existed) {
                removeDatabaseProxyChild(state, prop)
                notifyDatabaseProxy(state, {
                    path: [normalizePathKey(obj, prop)],
                    value: undefined,
                    oldValue,
                    type: 'delete',
                })
            }
            return result
        },
    })

    state = {
        target,
        proxy,
        listeners: new Set(),
        children: new Map(),
    }
    databaseProxyStates.set(proxy, state)
    databaseProxyCache.set(target, state)

    // Connect the complete JSON-data subtree eagerly so retained proxies work
    // immediately after attachment without requiring the new path to be read.
    for (const prop of Reflect.ownKeys(target)) {
        addDatabaseProxyChild(state, prop, readDatabaseProxyChild(target, prop))
    }

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
    unsubscribeActiveRoot?.()
    unsubscribeActiveRoot = undefined
    mutableDBState.db = unwrapDatabaseProxy(data)
    const database = createDatabaseProxy(mutableDBState.db)
    const rootState = databaseProxyStates.get(database)
    if (!rootState) {
        throw new Error('Database root must be proxyable')
    }
    unsubscribeActiveRoot = subscribeDatabaseProxy(rootState, emitDatabaseUpdate)
    mutableDBState.db = database
    emitDatabaseUpdate({ path: [], value: DBState.db, oldValue, type: 'set' })
}
