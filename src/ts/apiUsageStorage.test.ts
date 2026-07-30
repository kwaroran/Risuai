import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    API_USAGE_SAVE_DEBOUNCE_MS,
    API_USAGE_STORAGE_KEY,
    API_USAGE_STORAGE_VERSION,
    initializeApiUsagePersistence,
    type ApiUsageStorage,
} from './apiUsageStorage'
import {
    API_USAGE_MAX_RECENT_RECORDS,
    createEmptyApiUsageStats,
    recordApiUsage,
    type ApiUsageStats,
} from './apiUsage'
import { ApiUsageState, replaceApiUsageState } from './apiUsageState.svelte'

class MemoryApiUsageStorage implements ApiUsageStorage {
    value: Uint8Array | null = null
    failWrites = false
    getItem = vi.fn(async () => this.value)
    setItem = vi.fn(async (_key: string, value: Uint8Array) => {
        if (this.failWrites) throw new Error('storage unavailable')
        this.value = value
    })
}

function storedPayload(stats: unknown) {
    return new TextEncoder().encode(JSON.stringify({
        version: API_USAGE_STORAGE_VERSION,
        stats,
    }))
}

function recentRecord(id: string, timestamp: number) {
    return {
        id,
        timestamp,
        model: 'test-model',
        inputTokens: 1,
        outputTokens: 2,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        reportedCostUsd: null,
        status: 'success',
        mode: 'model',
    }
}

describe('API usage dedicated persistence', () => {
    beforeEach(() => {
        replaceApiUsageState(createEmptyApiUsageStats())
    })

    afterEach(() => {
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('loads and normalizes persisted API usage', async () => {
        const storage = new MemoryApiUsageStorage()
        const now = Date.now()
        storage.value = storedPayload({
            daily: [],
            recentRequests: [
                recentRecord('newer', now),
                recentRecord('older', now - 1),
                { id: '', timestamp: now, model: 'invalid' },
            ],
        })
        const database = {
            apiUsage: {
                daily: { legacy: { requestCount: 100 } },
                recentRequests: [],
            } as unknown as ApiUsageStats,
        }

        await initializeApiUsagePersistence(database, storage)

        expect(ApiUsageState.daily).toEqual({})
        expect(ApiUsageState.recentRequests.map((record) => record.id)).toEqual(['older', 'newer'])
        expect(database.apiUsage).toBeUndefined()
    })

    it('migrates legacy usage once without duplicating aggregates after reload', async () => {
        const storage = new MemoryApiUsageStorage()
        const now = Date.now()
        const legacy = {
            daily: {
                '2026-07-28': {
                    inputTokens: 10,
                    outputTokens: 2,
                    requestCount: 1,
                    models: {},
                },
            },
            recentRequests: Array.from(
                { length: API_USAGE_MAX_RECENT_RECORDS + 1 },
                (_, index) => recentRecord(String(index), now - index),
            ),
        } as unknown as ApiUsageStats
        const firstDatabase = { apiUsage: legacy }

        await initializeApiUsagePersistence(firstDatabase, storage)

        expect(storage.setItem).toHaveBeenCalledWith(API_USAGE_STORAGE_KEY, expect.any(Uint8Array))
        expect(firstDatabase.apiUsage).toBeUndefined()
        expect(ApiUsageState.daily['2026-07-28'].requestCount).toBe(1)
        expect(ApiUsageState.recentRequests).toHaveLength(API_USAGE_MAX_RECENT_RECORDS)

        const secondDatabase = { apiUsage: legacy }
        await initializeApiUsagePersistence(secondDatabase, storage)

        expect(secondDatabase.apiUsage).toBeUndefined()
        expect(ApiUsageState.daily['2026-07-28'].requestCount).toBe(1)
        expect(storage.setItem).toHaveBeenCalledTimes(1)
    })

    it('keeps the legacy source when migration persistence fails', async () => {
        const storage = new MemoryApiUsageStorage()
        storage.failWrites = true
        const database = {
            apiUsage: {
                daily: {},
                recentRequests: [],
            },
        }
        vi.spyOn(console, 'error').mockImplementation(() => {})

        await initializeApiUsagePersistence(database, storage)

        expect(database.apiUsage).toBeDefined()
        expect(ApiUsageState).toEqual(createEmptyApiUsageStats())
    })

    it('debounces request-path writes and isolates persistence errors', async () => {
        vi.useFakeTimers()
        const storage = new MemoryApiUsageStorage()
        await initializeApiUsagePersistence({}, storage)
        storage.failWrites = true
        vi.spyOn(console, 'error').mockImplementation(() => {})

        expect(() => {
            recordApiUsage({ model: 'first', inputTokens: 1, outputTokens: 1 })
            recordApiUsage({ model: 'second', inputTokens: 1, outputTokens: 1 })
        }).not.toThrow()
        expect(storage.setItem).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(API_USAGE_SAVE_DEBOUNCE_MS - 1)
        expect(storage.setItem).not.toHaveBeenCalled()
        await vi.advanceTimersByTimeAsync(1)

        expect(storage.setItem).toHaveBeenCalledTimes(1)
        expect(ApiUsageState.recentRequests).toHaveLength(2)
    })
})
