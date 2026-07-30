import type { LLMModel } from './model/modellist'
import type { OpenAIChat } from './process/index.svelte'
import type {
    ApiUsageAttemptDetails,
    ApiUsageAttemptResult,
    requestDataResponse,
    StreamResponseChunk,
} from './process/request/request'
import {
    recordApiUsage,
    type ApiUsageProvider,
    type ApiUsageRequestMode,
    type ApiUsageRequestStatus,
} from './apiUsage'
import { ChatTokenizer, tokenize, type TokenizerEncodeOptions } from './tokenizer'

interface ApiUsageRecorderOptions {
    formated: OpenAIChat[]
    mode: ApiUsageRequestMode
    model: string
    modelInfo: LLMModel
    provider?: ApiUsageProvider
    abortSignal?: AbortSignal | null
}

interface NormalizedUsage {
    inputTokens: number
    outputTokens: number
    cachedInputTokens: number
    reasoningTokens: number
    providerCostUsd?: number
}

function getTokenizerOptions(model: string, modelInfo: LLMModel): TokenizerEncodeOptions {
    return {
        aiModel: model,
        modelInfo,
        localOnly: true,
    }
}

async function countOutputTokens(
    output: string[],
    tokenizerOptions: TokenizerEncodeOptions,
): Promise<number> {
    try {
        let tokens = 0
        for (const text of output) {
            tokens += await tokenize(text, tokenizerOptions)
        }
        return tokens
    }
    catch (error) {
        console.error('[API Usage] Failed to count output tokens', error)
        return 0
    }
}

function getStreamOutput(chunk: StreamResponseChunk): string[] {
    return Object.entries(chunk)
        .filter(([key, text]) => !key.startsWith('__') && Boolean(text))
        .map(([, text]) => text)
}

function snapshotValue<T>(value: T): T {
    try {
        return structuredClone(value)
    }
    catch {
        return JSON.parse(JSON.stringify(value)) as T
    }
}

function serializeInput(input: unknown): string {
    return JSON.stringify(input, (key, value) => {
        if (typeof value !== 'string') return value
        if ((key === 'data' || key === 'image_url' || key === 'file_data') && value.startsWith('data:')) {
            return '[binary data]'
        }
        return value
    })
}

function normalizeUsage(usage: unknown): NormalizedUsage | null {
    if (!usage || typeof usage !== 'object') return null
    const value = usage as Record<string, unknown>
    const number = (candidate: unknown) => typeof candidate === 'number' && Number.isFinite(candidate)
        ? Math.max(0, candidate)
        : 0
    const optionalNumber = (candidate: unknown) => typeof candidate === 'number'
        && Number.isFinite(candidate)
        && candidate >= 0
        ? candidate
        : undefined
    const object = (candidate: unknown) => candidate && typeof candidate === 'object'
        ? candidate as Record<string, unknown>
        : {}
    const costDetails = object(value.cost_details)
    const providerCostUsd = value.is_byok === true
        ? optionalNumber(costDetails.upstream_inference_cost) ?? optionalNumber(value.cost)
        : optionalNumber(value.cost)

    if ('promptTokenCount' in value || 'candidatesTokenCount' in value) {
        const inputTokens = number(value.promptTokenCount)
        const reasoningTokens = number(value.thoughtsTokenCount)
        return {
            inputTokens,
            outputTokens: number(value.candidatesTokenCount) + reasoningTokens,
            cachedInputTokens: Math.min(inputTokens, number(value.cachedContentTokenCount)),
            reasoningTokens,
            providerCostUsd,
        }
    }

    if ('prompt_tokens' in value || 'completion_tokens' in value) {
        const inputTokens = number(value.prompt_tokens)
        const outputTokens = number(value.completion_tokens)
        const promptDetails = object(value.prompt_tokens_details)
        const completionDetails = object(value.completion_tokens_details)
        const cacheReadInputTokens = Math.min(inputTokens, number(promptDetails.cached_tokens))
        const cacheWriteInputTokens = Math.min(
            inputTokens - cacheReadInputTokens,
            number(promptDetails.cache_write_tokens),
        )
        return {
            inputTokens,
            outputTokens,
            cachedInputTokens: cacheReadInputTokens + cacheWriteInputTokens,
            reasoningTokens: Math.min(outputTokens, number(completionDetails.reasoning_tokens)),
            providerCostUsd,
        }
    }

    if ('input_tokens' in value || 'output_tokens' in value) {
        const baseInputTokens = number(value.input_tokens)
        const cacheCreationInputTokens = number(value.cache_creation_input_tokens)
        const cacheReadInputTokens = number(value.cache_read_input_tokens)
        const inputTokens = baseInputTokens + cacheCreationInputTokens + cacheReadInputTokens
        const outputTokens = number(value.output_tokens)
        const inputDetails = object(value.input_tokens_details)
        const outputDetails = object(value.output_tokens_details)
        const topLevelCachedTokens = cacheCreationInputTokens + cacheReadInputTokens
        const detailedCachedTokens = number(inputDetails.cached_tokens) + number(inputDetails.cache_write_tokens)
        return {
            inputTokens,
            outputTokens,
            cachedInputTokens: Math.min(
                inputTokens,
                Math.max(topLevelCachedTokens, detailedCachedTokens),
            ),
            reasoningTokens: Math.min(outputTokens, number(outputDetails.reasoning_tokens)),
            providerCostUsd,
        }
    }

    return null
}

function getStreamAttemptResult(chunk: StreamResponseChunk): ApiUsageAttemptResult {
    let usage: unknown
    try {
        usage = chunk.__usage ? JSON.parse(chunk.__usage) : undefined
    }
    catch {
        usage = undefined
    }
    const billingStatus = chunk.__usageBillingStatus === 'not_billed'
        || chunk.__usageBillingStatus === 'unknown'
        || chunk.__usageBillingStatus === 'estimated'
        ? chunk.__usageBillingStatus
        : undefined
    return { usage, billingStatus }
}

export function createApiUsageRecorder(options: ApiUsageRecorderOptions) {
    const tokenizerOptions = getTokenizerOptions(options.model, options.modelInfo)
    const chatAdditionalTokens = options.model.startsWith('gpt') ? 5 : 3
    const useName = options.model.startsWith('gpt') ? 'noName' : 'name'
    const tokenizer = new ChatTokenizer(chatAdditionalTokens, useName, tokenizerOptions)
    const countChats = async (chats: OpenAIChat[]) => {
        const snapshot = snapshotValue(chats)
        if (snapshot.some((chat) => typeof chat.content !== 'string')) {
            return tokenize(serializeInput(snapshot), tokenizerOptions)
        }
        const baseTokens = await tokenizer.tokenizeChats(snapshot)
        const structuredFields = snapshot.map((chat) => {
            const extended = chat as OpenAIChat & { tool_calls?: unknown, tool_call_id?: unknown }
            return {
                tool_calls: extended.tool_calls,
                tool_call_id: extended.tool_call_id,
            }
        }).filter((chat) => chat.tool_calls || chat.tool_call_id)
        return baseTokens + (structuredFields.length > 0
            ? await tokenize(serializeInput(structuredFields), tokenizerOptions)
            : 0)
    }
    const countInput = (attempt: ApiUsageAttemptDetails) => {
        const promise = attempt.inputChats
            ? countChats(attempt.inputChats)
            : attempt.input !== undefined
                ? tokenize(serializeInput(snapshotValue(attempt.input)), tokenizerOptions)
                : countChats(options.formated)
        return promise.catch((error) => {
            console.error('[API Usage] Failed to count input tokens', error)
            return 0
        })
    }
    let currentAttempt: ApiUsageAttemptDetails = {
        inputChats: options.formated,
    }
    let inputTokensPromise = countInput(currentAttempt)
    let resolvedModel = options.modelInfo.internalID || options.model
    let finalized = false

    async function recordAttempt(status: ApiUsageRequestStatus, result: ApiUsageAttemptResult = {}) {
        const attemptModel = resolvedModel
        const reportedUsage = normalizeUsage(result.usage)
        const [inputTokens, outputTokens] = await Promise.all([
            reportedUsage ? reportedUsage.inputTokens : inputTokensPromise,
            reportedUsage ? reportedUsage.outputTokens : countOutputTokens(result.output ?? [], tokenizerOptions),
        ])
        const billingStatus = result.billingStatus
            ?? (reportedUsage || status === 'success' ? 'estimated' : 'unknown')
        recordApiUsage({
            model: attemptModel,
            provider: options.provider,
            inputTokens,
            outputTokens,
            cachedInputTokens: reportedUsage?.cachedInputTokens,
            reasoningTokens: reportedUsage?.reasoningTokens,
            providerCostUsd: reportedUsage?.providerCostUsd,
            billingStatus,
            status,
            mode: options.mode,
        })
    }

    async function finalize(status: ApiUsageRequestStatus, result: ApiUsageAttemptResult = {}) {
        if (finalized) return
        finalized = true
        await recordAttempt(status, result)
    }

    return {
        resolveModel(model: string | null | undefined) {
            const normalizedModel = model?.trim()
            if (normalizedModel) resolvedModel = normalizedModel
        },
        prepareAttempt(attempt: ApiUsageAttemptDetails) {
            currentAttempt = {
                ...currentAttempt,
                ...attempt,
                input: attempt.inputChats !== undefined ? undefined : attempt.input ?? currentAttempt.input,
                inputChats: attempt.input !== undefined ? undefined : attempt.inputChats ?? currentAttempt.inputChats,
            }
            inputTokensPromise = countInput(currentAttempt)
        },
        async finalizeResponse(response: requestDataResponse): Promise<requestDataResponse> {
            if (response.type === 'success') {
                await finalize('success', {
                    usage: response.usage,
                    output: [response.result],
                    billingStatus: response.usageBillingStatus,
                })
                return response
            }
            if (response.type === 'multiline') {
                await finalize('success', {
                    usage: response.usage,
                    output: response.result.map(([, text]) => text),
                    billingStatus: response.usageBillingStatus,
                })
                return response
            }
            if (response.type === 'fail') {
                await finalize(options.abortSignal?.aborted ? 'cancelled' : 'failed', {
                    usage: response.usage,
                    billingStatus: response.usageBillingStatus,
                })
                return response
            }

            const streamingResponse = response as Extract<requestDataResponse, { type: 'streaming' }>
            const reader = streamingResponse.result.getReader()
            let lastResponseChunk: StreamResponseChunk = {}
            const trackedStream = new ReadableStream<StreamResponseChunk>({
                async pull(controller) {
                    try {
                        const { done, value } = await reader.read()
                        if (value) {
                            lastResponseChunk = { ...lastResponseChunk, ...value }
                            controller.enqueue(value)
                        }
                        if (done) {
                            const result = getStreamAttemptResult(lastResponseChunk)
                            const streamStatus = lastResponseChunk.__usageStatus === 'failed' ? 'failed' : 'success'
                            await finalize(
                                options.abortSignal?.aborted ? 'cancelled' : streamStatus,
                                { ...result, output: getStreamOutput(lastResponseChunk) },
                            )
                            controller.close()
                        }
                    }
                    catch (error) {
                        const result = getStreamAttemptResult(lastResponseChunk)
                        await finalize(
                            options.abortSignal?.aborted ? 'cancelled' : 'failed',
                            { ...result, output: getStreamOutput(lastResponseChunk) },
                        )
                        controller.error(error)
                    }
                },
                async cancel(reason) {
                    try {
                        await reader.cancel(reason)
                    }
                    finally {
                        const result = getStreamAttemptResult(lastResponseChunk)
                        await finalize('cancelled', { ...result, output: getStreamOutput(lastResponseChunk) })
                    }
                },
            })

            return {
                ...streamingResponse,
                result: trackedStream,
            }
        },
        async finalizeFailure() {
            await finalize(options.abortSignal?.aborted ? 'cancelled' : 'failed')
        },
        async finalizeAttempt(completedStatus: 'success' | 'failed', result?: ApiUsageAttemptResult) {
            await finalize(completedStatus, result)
        },
        async recordNextAttempt(completedStatus: 'success' | 'failed', result?: ApiUsageAttemptResult) {
            if (finalized) return
            await recordAttempt(completedStatus, result)
        },
    }
}
