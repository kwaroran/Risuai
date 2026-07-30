import { normalizeApiUsageStats, type ApiUsageStats } from './apiUsage'
import {
    ApiUsageState,
    replaceApiUsageState,
    setApiUsageChangeListener,
} from './apiUsageState.svelte'

export const API_USAGE_STORAGE_KEY = 'apiUsage/stats.bin'
export const API_USAGE_STORAGE_VERSION = 1
export const API_USAGE_SAVE_DEBOUNCE_MS = 500

export interface ApiUsageStorage {
    getItem(key: string): Promise<Buffer | Uint8Array | null>
    setItem(key: string, value: Uint8Array): Promise<unknown>
}

interface LegacyApiUsageDatabase {
    apiUsage?: ApiUsageStats
}

interface StoredApiUsage {
    version: number
    stats: ApiUsageStats
}

let activeStorage: ApiUsageStorage | null = null
let saveTimeout: ReturnType<typeof setTimeout> | null = null
let writeChain = Promise.resolve(true)
let pendingLegacyDatabase: LegacyApiUsageDatabase | null = null

function decodeStoredApiUsage(value: Buffer | Uint8Array): unknown {
    const decoded = JSON.parse(new TextDecoder().decode(value))
    if (
        decoded
        && typeof decoded === 'object'
        && !Array.isArray(decoded)
        && (decoded as Partial<StoredApiUsage>).version === API_USAGE_STORAGE_VERSION
        && 'stats' in decoded
    ) {
        return (decoded as Partial<StoredApiUsage>).stats
    }
    throw new Error('Unsupported API usage storage format')
}

function clearLegacyApiUsage() {
    if (pendingLegacyDatabase?.apiUsage) {
        delete pendingLegacyDatabase.apiUsage
    }
    pendingLegacyDatabase = null
}

async function writeApiUsageSnapshot(): Promise<boolean> {
    if (!activeStorage) return false
    try {
        const payload: StoredApiUsage = {
            version: API_USAGE_STORAGE_VERSION,
            stats: ApiUsageState,
        }
        await activeStorage.setItem(
            API_USAGE_STORAGE_KEY,
            new TextEncoder().encode(JSON.stringify(payload)),
        )
        clearLegacyApiUsage()
        return true
    }
    catch (error) {
        console.error('Failed to persist API usage statistics', error)
        return false
    }
}

export function scheduleApiUsagePersistence() {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
    }
    saveTimeout = setTimeout(() => {
        saveTimeout = null
        void flushApiUsagePersistence()
    }, API_USAGE_SAVE_DEBOUNCE_MS)
}

export function flushApiUsagePersistence(): Promise<boolean> {
    if (saveTimeout) {
        clearTimeout(saveTimeout)
        saveTimeout = null
    }
    writeChain = writeChain.then(writeApiUsageSnapshot, writeApiUsageSnapshot)
    return writeChain
}

export async function initializeApiUsagePersistence(
    database: LegacyApiUsageDatabase,
    storage: ApiUsageStorage,
) {
    activeStorage = storage
    pendingLegacyDatabase = null

    let storedValue: Buffer | Uint8Array | null = null
    try {
        storedValue = await activeStorage.getItem(API_USAGE_STORAGE_KEY)
    }
    catch (error) {
        console.error('Failed to load API usage statistics', error)
    }

    if (storedValue) {
        try {
            replaceApiUsageState(normalizeApiUsageStats(decodeStoredApiUsage(storedValue)))
            delete database.apiUsage
            return
        }
        catch (error) {
            console.error('Failed to decode API usage statistics', error)
        }
    }

    replaceApiUsageState(normalizeApiUsageStats(database.apiUsage))
    if (database.apiUsage) {
        pendingLegacyDatabase = database
        await flushApiUsagePersistence()
    }
}

setApiUsageChangeListener(scheduleApiUsagePersistence)
