import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    API_USAGE_MAX_RECENT_RECORDS,
    API_USAGE_RECENT_RETENTION_MS,
    createEmptyApiUsageStats,
    getApiUsageDateKey,
    getApiUsageProvider,
    normalizeApiUsageStats,
    recordApiUsage,
} from './apiUsage'
import { ApiUsageState, replaceApiUsageState } from './apiUsageState.svelte'
import { LLMProvider } from './model/types'

describe('API usage persistence', () => {
    beforeEach(() => {
        replaceApiUsageState(createEmptyApiUsageStats())
    })

    it('uses local calendar dates for daily buckets', () => {
        expect(getApiUsageDateKey(new Date(2026, 6, 5, 23, 30))).toBe('2026-07-05')
    })

    it('normalizes missing and malformed stored data', () => {
        expect(normalizeApiUsageStats(undefined)).toEqual(createEmptyApiUsageStats())
        expect(normalizeApiUsageStats({ daily: [], recentRequests: {} })).toEqual(createEmptyApiUsageStats())

        const now = Date.now()
        const normalized = normalizeApiUsageStats({
            daily: {
                '2026-07-27': {
                    inputTokens: -10,
                    outputTokens: 20,
                    requestCount: 2,
                    failedRequestCount: 1,
                    models: {
                        test: {
                            inputTokens: 5,
                            requestCount: 1,
                        },
                    },
                },
            },
            recentRequests: [
                {
                    id: 'valid',
                    timestamp: now,
                    model: 'test',
                    inputTokens: -1,
                    outputTokens: 2,
                    reportedCostUsd: -3,
                    status: 'invalid',
                    mode: 'invalid',
                },
                { id: '', timestamp: now, model: 'invalid' },
            ],
        }, now)

        expect(normalized.daily['2026-07-27']).toMatchObject({
            inputTokens: 0,
            outputTokens: 20,
            requestCount: 2,
            successRequestCount: 1,
            failedRequestCount: 1,
        })
        expect(normalized.daily['2026-07-27'].models.test).toMatchObject({
            inputTokens: 5,
            requestCount: 1,
            successRequestCount: 1,
        })
        expect(normalized.recentRequests).toEqual([
            expect.objectContaining({
                id: 'valid',
                inputTokens: 0,
                reportedCostUsd: null,
                status: 'success',
                mode: 'model',
            }),
        ])
    })

    it('records daily, model, status, mode, token details, and provider-reported cost', () => {
        const date = new Date(2026, 6, 27, 12)
        recordApiUsage({
            model: 'shared-model',
            provider: { id: 'provider:0', name: 'OpenAI' },
            inputTokens: 100,
            outputTokens: 50,
            cachedInputTokens: 30,
            reasoningTokens: 20,
            providerCostUsd: 0.0123,
            status: 'success',
            mode: 'translate',
            date,
        })
        recordApiUsage({
            model: 'shared-model',
            provider: { id: 'provider:0', name: 'OpenAI' },
            inputTokens: 10,
            outputTokens: 0,
            status: 'failed',
            mode: 'translate',
            date,
        })

        const day = ApiUsageState.daily['2026-07-27']
        expect(day).toMatchObject({
            inputTokens: 110,
            outputTokens: 50,
            cachedInputTokens: 30,
            reasoningTokens: 20,
            requestCount: 2,
            successRequestCount: 1,
            failedRequestCount: 1,
            requestCountsByMode: { translate: 2 },
            reportedCostUsd: 0.0123,
            costReportedRequestCount: 1,
        })
        expect(Object.values(day.models)[0]).toMatchObject({
            model: 'shared-model',
            provider: { id: 'provider:0', name: 'OpenAI' },
            requestCount: 2,
            reportedCostUsd: 0.0123,
            costReportedRequestCount: 1,
        })
        expect(ApiUsageState.recentRequests).toHaveLength(2)
    })

    it('keeps identical model ids separate by provider', () => {
        const date = new Date()
        recordApiUsage({
            model: 'shared-model',
            provider: { id: 'provider:0', name: 'OpenAI' },
            inputTokens: 1,
            outputTokens: 1,
            date,
        })
        recordApiUsage({
            model: 'shared-model',
            provider: { id: 'model:openrouter', name: 'OpenRouter' },
            inputTokens: 2,
            outputTokens: 2,
            date,
        })

        const day = ApiUsageState.daily[getApiUsageDateKey(date)]
        expect(Object.values(day.models)).toHaveLength(2)
        expect(Object.values(day.models).map((stats) => stats.provider?.name).sort()).toEqual([
            'OpenAI',
            'OpenRouter',
        ])
    })

    it('stores explicitly unbilled attempts as reported zero cost', () => {
        recordApiUsage({
            model: 'claude',
            inputTokens: 100,
            outputTokens: 0,
            billingStatus: 'not_billed',
        })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day.reportedCostUsd).toBe(0)
        expect(day.costReportedRequestCount).toBe(1)
        expect(ApiUsageState.recentRequests[0].reportedCostUsd).toBe(0)
    })

    it('drops expired recent records while retaining daily aggregates', () => {
        const now = Date.now()
        recordApiUsage({
            model: 'old',
            inputTokens: 1,
            outputTokens: 1,
            date: new Date(now - API_USAGE_RECENT_RETENTION_MS - 1),
        })
        recordApiUsage({
            model: 'current',
            inputTokens: 2,
            outputTokens: 2,
            date: new Date(now),
        })

        expect(ApiUsageState.recentRequests.map((record) => record.model)).toEqual(['current'])
        expect(Object.keys(ApiUsageState.daily)).toHaveLength(2)
    })

    it('appends normal runtime records without sorting and keeps the newest 500', () => {
        const now = Date.now()
        const sortSpy = vi.spyOn(Array.prototype, 'sort')

        for (let index = 0; index <= API_USAGE_MAX_RECENT_RECORDS; index++) {
            recordApiUsage({
                model: String(index),
                inputTokens: 1,
                outputTokens: 1,
                date: new Date(now + index),
            })
        }

        expect(sortSpy).not.toHaveBeenCalled()
        expect(ApiUsageState.recentRequests).toHaveLength(API_USAGE_MAX_RECENT_RECORDS)
        expect(ApiUsageState.recentRequests[0].model).toBe('1')
        expect(ApiUsageState.recentRequests.at(-1)?.model).toBe(String(API_USAGE_MAX_RECENT_RECORDS))
        sortSpy.mockRestore()
    })

    it('inserts an out-of-order runtime record at its timestamp position', () => {
        const now = Date.now()
        recordApiUsage({ model: 'newest', inputTokens: 1, outputTokens: 1, date: new Date(now) })
        recordApiUsage({ model: 'oldest', inputTokens: 1, outputTokens: 1, date: new Date(now - 2) })
        recordApiUsage({ model: 'middle', inputTokens: 1, outputTokens: 1, date: new Date(now - 1) })

        expect(ApiUsageState.recentRequests.map((record) => record.model)).toEqual([
            'oldest',
            'middle',
            'newest',
        ])
    })

    it('caps normalized recent records', () => {
        const now = Date.now()
        const recentRequests = Array.from({ length: API_USAGE_MAX_RECENT_RECORDS + 1 }, (_, index) => ({
                id: String(index),
                timestamp: now - API_USAGE_MAX_RECENT_RECORDS + index,
                model: 'model',
                inputTokens: 1,
                outputTokens: 1,
                cachedInputTokens: 0,
                reasoningTokens: 0,
                reportedCostUsd: null,
                status: 'success',
                mode: 'model',
            }))
        const normalized = normalizeApiUsageStats({ daily: {}, recentRequests }, now)

        expect(normalized.recentRequests).toHaveLength(API_USAGE_MAX_RECENT_RECORDS)
        expect(normalized.recentRequests[0].id).toBe('1')
    })

    it('escapes unsafe model keys', () => {
        recordApiUsage({
            model: '__proto__',
            inputTokens: 1,
            outputTokens: 1,
        })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(Object.keys(day.models)).toEqual(['model:__proto__'])
    })

    it('normalizes custom provider identity without storing request credentials', () => {
        expect(getApiUsageProvider(
            'reverse_proxy',
            { name: 'Example', provider: LLMProvider.AsIs, endpoint: '' },
            'risu::https://example.test/v1/',
        )).toEqual({
            id: 'custom',
            name: 'Example',
            url: 'https://example.test/v1',
        })
    })
})
