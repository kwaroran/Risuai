import { LLMProvider, ProviderNames, type LLMModel } from './model/types'
import {
    ApiUsageState,
    notifyApiUsageChanged,
} from './apiUsageState.svelte'

export interface ApiUsageModelStats {
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    reasoningTokens: number
    requestCount: number
    successRequestCount: number
    failedRequestCount: number
    cancelledRequestCount: number
    requestCountsByMode: Record<ApiUsageRequestMode, number>
    reportedCostUsd: number
    costReportedRequestCount: number
    model?: string
    provider?: ApiUsageProvider
}

export interface ApiUsageDay extends ApiUsageModelStats {
    models: Record<string, ApiUsageModelStats>
}

export interface ApiUsageStats {
    daily: Record<string, ApiUsageDay>
    recentRequests: ApiUsageRecentRecord[]
}

export interface ApiUsageRecentRecord {
    id: string
    timestamp: number
    model: string
    provider?: ApiUsageProvider
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    reasoningTokens: number
    reportedCostUsd: number | null
    status: ApiUsageRequestStatus
    mode: ApiUsageRequestMode
}

export interface ApiUsageProvider {
    id: string
    name: string
    url?: string
}

export type ApiUsageRequestStatus = 'success' | 'failed' | 'cancelled'
export type ApiUsageRequestMode = 'model' | 'submodel' | 'memory' | 'emotion' | 'otherAx' | 'translate'
export type ApiUsageBillingStatus = 'estimated' | 'not_billed' | 'unknown'

export const apiUsageRequestModes: ApiUsageRequestMode[] = [
    'model',
    'submodel',
    'memory',
    'emotion',
    'otherAx',
    'translate',
]

export const API_USAGE_RECENT_RETENTION_MS = 48 * 60 * 60 * 1000
export const API_USAGE_MAX_RECENT_RECORDS = 500

export interface ApiUsageRecord {
    model: string
    provider?: ApiUsageProvider
    inputTokens: number
    outputTokens: number
    cachedInputTokens?: number
    reasoningTokens?: number
    providerCostUsd?: number
    date?: Date
    billingStatus?: ApiUsageBillingStatus
    status?: ApiUsageRequestStatus
    mode?: ApiUsageRequestMode
}

export function getApiUsageProvider(
    model: string,
    modelInfo: Pick<LLMModel, 'name' | 'provider' | 'endpoint'>,
    customURL?: string,
): ApiUsageProvider {
    if (model === 'reverse_proxy' || model.startsWith('xcustom:::')) {
        const url = normalizeApiUsageProviderUrl(customURL ?? modelInfo.endpoint)
        return {
            id: 'custom',
            name: modelInfo.name || 'Custom API',
            ...(url ? { url } : {}),
        }
    }
    if (model === 'custom' || model.startsWith('pluginmodel:::')) {
        return { id: 'plugin', name: modelInfo.name || 'Plugin' }
    }
    if (modelInfo.provider === LLMProvider.AsIs) {
        return { id: `model:${model}`, name: modelInfo.name || model }
    }
    return {
        id: `provider:${modelInfo.provider}`,
        name: ProviderNames.get(modelInfo.provider) || modelInfo.name || model,
    }
}

export function normalizeApiUsageProviderUrl(value: string | null | undefined): string | undefined {
    const normalized = value?.trim().replace(/^risu::/, '').replace(/\/+$/, '')
    return normalized || undefined
}

export function createEmptyApiUsageStats(): ApiUsageStats {
    return { daily: {}, recentRequests: [] }
}

export function normalizeApiUsageStats(value: unknown, now = Date.now()): ApiUsageStats {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return createEmptyApiUsageStats()
    }

    const normalized = createEmptyApiUsageStats()
    const stored = value as Partial<ApiUsageStats>
    if (stored.daily && typeof stored.daily === 'object' && !Array.isArray(stored.daily)) {
        for (const [date, storedDay] of Object.entries(stored.daily)) {
            if (!storedDay || typeof storedDay !== 'object' || Array.isArray(storedDay)) continue

            const day = normalizeStoredStats(storedDay)
            const storedModels = (storedDay as Partial<ApiUsageDay>).models
            const models: Record<string, ApiUsageModelStats> = {}
            if (storedModels && typeof storedModels === 'object' && !Array.isArray(storedModels)) {
                for (const [model, stats] of Object.entries(storedModels)) {
                    if (stats && typeof stats === 'object' && !Array.isArray(stats)) {
                        models[model] = normalizeStoredStats(stats)
                    }
                }
            }
            normalized.daily[date] = { ...day, models }
        }
    }

    if (Array.isArray(stored.recentRequests)) {
        const cutoff = now - API_USAGE_RECENT_RETENTION_MS
        normalized.recentRequests = stored.recentRequests
            .map(normalizeStoredRecentRecord)
            .filter((record): record is ApiUsageRecentRecord => Boolean(
                record && record.timestamp >= cutoff && record.timestamp <= now,
            ))
            .sort((a, b) => a.timestamp - b.timestamp)
            .slice(-API_USAGE_MAX_RECENT_RECORDS)
    }

    return normalized
}

function normalizeNonNegativeNumber(value: unknown): number {
    return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0
}

function normalizeOptionalCost(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

function normalizeStoredRecentRecord(value: unknown): ApiUsageRecentRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    const stored = value as Partial<ApiUsageRecentRecord>
    const id = stored.id?.trim()
    const model = stored.model?.trim()
    const timestamp = stored.timestamp
    if (!id || !model || !Number.isFinite(timestamp)) return null

    const status = stored.status === 'failed' || stored.status === 'cancelled' ? stored.status : 'success'
    const mode = apiUsageRequestModes.includes(stored.mode as ApiUsageRequestMode)
        ? stored.mode as ApiUsageRequestMode
        : 'model'
    const provider = normalizeStoredProvider(stored.provider)
    return {
        id,
        timestamp: timestamp as number,
        model,
        ...(provider ? { provider } : {}),
        inputTokens: normalizeNonNegativeNumber(stored.inputTokens),
        outputTokens: normalizeNonNegativeNumber(stored.outputTokens),
        cachedInputTokens: normalizeNonNegativeNumber(stored.cachedInputTokens),
        reasoningTokens: normalizeNonNegativeNumber(stored.reasoningTokens),
        reportedCostUsd: normalizeOptionalCost(stored.reportedCostUsd),
        status,
        mode,
    }
}

function normalizeStoredProvider(value: unknown): ApiUsageProvider | undefined {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const stored = value as Partial<ApiUsageProvider>
    const id = stored.id?.trim()
    const name = stored.name?.trim()
    if (!id || !name) return undefined
    const url = normalizeApiUsageProviderUrl(stored.url)
    if (id === 'custom' && !url) return undefined
    return { id, name, ...(url ? { url } : {}) }
}

export function getApiUsageDateKey(date = new Date()): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function createEmptyRequestCountsByMode(): Record<ApiUsageRequestMode, number> {
    return Object.fromEntries(apiUsageRequestModes.map((mode) => [mode, 0])) as Record<ApiUsageRequestMode, number>
}

function createEmptyModelStats(): ApiUsageModelStats {
    return {
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        requestCount: 0,
        successRequestCount: 0,
        failedRequestCount: 0,
        cancelledRequestCount: 0,
        requestCountsByMode: createEmptyRequestCountsByMode(),
        reportedCostUsd: 0,
        costReportedRequestCount: 0,
    }
}

function normalizeStoredStats(value: object): ApiUsageModelStats {
    const stored = value as Partial<ApiUsageModelStats>
    const storedRequestCount = normalizeNonNegativeNumber(stored.requestCount)
    const failedRequestCount = normalizeNonNegativeNumber(stored.failedRequestCount)
    const cancelledRequestCount = normalizeNonNegativeNumber(stored.cancelledRequestCount)
    const successRequestCount = typeof stored.successRequestCount === 'number'
        ? normalizeNonNegativeNumber(stored.successRequestCount)
        : Math.max(0, storedRequestCount - failedRequestCount - cancelledRequestCount)
    const requestCountsByMode = createEmptyRequestCountsByMode()
    if (stored.requestCountsByMode && typeof stored.requestCountsByMode === 'object') {
        for (const mode of apiUsageRequestModes) {
            requestCountsByMode[mode] = normalizeNonNegativeNumber(stored.requestCountsByMode[mode])
        }
    }
    else {
        requestCountsByMode.model = storedRequestCount
    }
    const provider = normalizeStoredProvider(stored.provider)
    const model = typeof stored.model === 'string' && stored.model.trim() ? stored.model.trim() : undefined
    return {
        inputTokens: normalizeNonNegativeNumber(stored.inputTokens),
        outputTokens: normalizeNonNegativeNumber(stored.outputTokens),
        cachedInputTokens: normalizeNonNegativeNumber(stored.cachedInputTokens),
        reasoningTokens: normalizeNonNegativeNumber(stored.reasoningTokens),
        requestCount: Math.max(storedRequestCount, successRequestCount + failedRequestCount + cancelledRequestCount),
        successRequestCount,
        failedRequestCount,
        cancelledRequestCount,
        requestCountsByMode,
        reportedCostUsd: normalizeNonNegativeNumber(stored.reportedCostUsd),
        costReportedRequestCount: normalizeNonNegativeNumber(stored.costReportedRequestCount),
        ...(model ? { model } : {}),
        ...(provider ? { provider } : {}),
    }
}

function applyUsageDelta(
    target: ApiUsageModelStats,
    metrics: ApiUsageModelStats | ApiUsageRecentRecord,
) {
    target.inputTokens += metrics.inputTokens
    target.outputTokens += metrics.outputTokens
    target.cachedInputTokens += metrics.cachedInputTokens
    target.reasoningTokens += metrics.reasoningTokens

    if ('timestamp' in metrics) {
        target.requestCount += 1
        const statusField = metrics.status === 'success'
            ? 'successRequestCount'
            : metrics.status === 'failed'
                ? 'failedRequestCount'
                : 'cancelledRequestCount'
        target[statusField] += 1
        target.requestCountsByMode[metrics.mode] += 1
        if (metrics.reportedCostUsd !== null) {
            target.reportedCostUsd += metrics.reportedCostUsd
            target.costReportedRequestCount += 1
        }
        return
    }

    target.requestCount += metrics.requestCount
    target.successRequestCount += metrics.successRequestCount
    target.failedRequestCount += metrics.failedRequestCount
    target.cancelledRequestCount += metrics.cancelledRequestCount
    for (const mode of apiUsageRequestModes) {
        target.requestCountsByMode[mode] += metrics.requestCountsByMode[mode]
    }
    target.reportedCostUsd += metrics.reportedCostUsd
    target.costReportedRequestCount += metrics.costReportedRequestCount
}

function getApiUsageModelStatsKey(model: string, provider?: ApiUsageProvider): string {
    return provider
        ? JSON.stringify([model, provider.id, provider.id === 'custom' ? provider.url ?? provider.name : ''])
        : model
}

function getReportedCost(record: ApiUsageRecord): number | null {
    if (record.billingStatus === 'not_billed') return 0
    return normalizeOptionalCost(record.providerCostUsd)
}

function createApiUsageRecentRecord(
    record: ApiUsageRecord,
    model: string,
    provider: ApiUsageProvider | undefined,
    timestamp: number,
): ApiUsageRecentRecord {
    const id = globalThis.crypto?.randomUUID?.()
        ?? `${timestamp}-${Math.random().toString(36).slice(2)}`
    return {
        id,
        timestamp,
        model,
        ...(provider ? { provider } : {}),
        inputTokens: Math.max(0, Math.round(record.inputTokens)),
        outputTokens: Math.max(0, Math.round(record.outputTokens)),
        cachedInputTokens: Math.max(0, Math.round(record.cachedInputTokens ?? 0)),
        reasoningTokens: Math.max(0, Math.round(record.reasoningTokens ?? 0)),
        reportedCostUsd: getReportedCost(record),
        status: record.status ?? 'success',
        mode: record.mode ?? 'model',
    }
}

export function recordApiUsage(record: ApiUsageRecord) {
    if (!ApiUsageState.daily || typeof ApiUsageState.daily !== 'object') {
        ApiUsageState.daily = {}
    }
    ApiUsageState.recentRequests ??= []

    const timestamp = record.date?.getTime() ?? Date.now()
    const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now()
    const dateKey = getApiUsageDateKey(new Date(normalizedTimestamp))
    const storedDay = ApiUsageState.daily[dateKey]
    const day = storedDay ? {
        ...normalizeStoredStats(storedDay),
        models: storedDay.models && typeof storedDay.models === 'object' ? storedDay.models : {},
    } : {
        ...createEmptyModelStats(),
        models: {},
    }
    const rawModel = record.model || 'unknown'
    const model = ['__proto__', 'prototype', 'constructor'].includes(rawModel)
        ? `model:${rawModel}`
        : rawModel
    const provider = normalizeStoredProvider(record.provider)
    const modelStatsKey = getApiUsageModelStatsKey(model, provider)
    const modelStats = day.models[modelStatsKey]
        ? normalizeStoredStats(day.models[modelStatsKey])
        : {
            ...createEmptyModelStats(),
            ...(provider ? { model, provider } : {}),
        }
    const recentRecord = createApiUsageRecentRecord(record, model, provider, normalizedTimestamp)

    applyUsageDelta(day, recentRecord)
    applyUsageDelta(modelStats, recentRecord)
    day.models[modelStatsKey] = modelStats
    ApiUsageState.daily[dateKey] = day

    const recentRequests = ApiUsageState.recentRequests
    const newestTimestamp = recentRequests.at(-1)?.timestamp ?? normalizedTimestamp
    const retentionReference = Math.max(normalizedTimestamp, newestTimestamp)
    const retentionCutoff = retentionReference - API_USAGE_RECENT_RETENTION_MS
    if (normalizedTimestamp >= retentionCutoff) {
        if (normalizedTimestamp >= newestTimestamp || recentRequests.length === 0) {
            recentRequests.push(recentRecord)
        }
        else {
            let low = 0
            let high = recentRequests.length
            while (low < high) {
                const middle = Math.floor((low + high) / 2)
                if (recentRequests[middle].timestamp <= normalizedTimestamp) {
                    low = middle + 1
                }
                else {
                    high = middle
                }
            }
            recentRequests.splice(low, 0, recentRecord)
        }
    }

    let expiredCount = 0
    while (
        expiredCount < recentRequests.length
        && recentRequests[expiredCount].timestamp < retentionCutoff
    ) {
        expiredCount += 1
    }
    if (expiredCount > 0) {
        recentRequests.splice(0, expiredCount)
    }
    const overflow = recentRequests.length - API_USAGE_MAX_RECENT_RECORDS
    if (overflow > 0) {
        recentRequests.splice(0, overflow)
    }
    notifyApiUsageChanged()
}
