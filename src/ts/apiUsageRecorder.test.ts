import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApiUsageRecorder } from './apiUsageRecorder'
import { createEmptyApiUsageStats } from './apiUsage'
import { ApiUsageState, replaceApiUsageState } from './apiUsageState.svelte'
import type { StreamResponseChunk, requestDataResponse } from './process/request/request'

vi.mock('./tokenizer', () => ({
    ChatTokenizer: class {
        async tokenizeChats() {
            return 12
        }
    },
    tokenize: vi.fn(async (text: string) => text.length),
}))

function makeRecorder(options: {
    mode?: 'model' | 'translate' | 'otherAx'
    abortSignal?: AbortSignal
    provider?: { id: string, name: string, url?: string }
} = {}) {
    return createApiUsageRecorder({
        formated: [{ role: 'user', content: 'Hello' }],
        mode: options.mode ?? 'model',
        model: 'gpt-5.5',
        modelInfo: { internalID: 'gpt-5.5' } as never,
        abortSignal: options.abortSignal,
        provider: options.provider,
    })
}

describe('API usage request recorder', () => {
    beforeEach(() => {
        replaceApiUsageState(createEmptyApiUsageStats())
    })

    it('records successful translation requests', async () => {
        const recorder = makeRecorder({ mode: 'translate' })
        await recorder.finalizeResponse({ type: 'success', result: 'Done' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            inputTokens: 12,
            outputTokens: 4,
            requestCount: 1,
            successRequestCount: 1,
            requestCountsByMode: { translate: 1 },
        })
    })

    it('records provider-internal retries as separate attempts', async () => {
        const recorder = makeRecorder({ mode: 'otherAx' })
        await recorder.recordNextAttempt('failed')
        await recorder.finalizeResponse({ type: 'success', result: 'Done' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            requestCount: 2,
            successRequestCount: 1,
            failedRequestCount: 1,
            requestCountsByMode: { otherAx: 2 },
        })
    })

    it('stores the provider identity on recorded requests', async () => {
        const recorder = makeRecorder({
            provider: { id: 'custom', name: 'Example AI', url: 'https://llm.example/v1' },
        })
        await recorder.finalizeResponse({ type: 'success', result: 'Done' })

        const model = Object.values(Object.values(ApiUsageState.daily)[0].models)[0]
        expect(model).toMatchObject({
            model: 'gpt-5.5',
            provider: { id: 'custom', name: 'Example AI', url: 'https://llm.example/v1' },
        })
    })

    it('uses each prepared request input and provider-reported usage per attempt', async () => {
        const recorder = makeRecorder()
        recorder.prepareAttempt({ input: { messages: ['first expanded request'] } })
        await recorder.recordNextAttempt('success', {
            usage: { prompt_tokens: 30, completion_tokens: 7 },
        })
        recorder.prepareAttempt({ input: { messages: ['second expanded request'] } })
        await recorder.finalizeResponse({
            type: 'success',
            result: 'Done',
            usage: { input_tokens: 50, output_tokens: 9 },
        })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            inputTokens: 80,
            outputTokens: 16,
            requestCount: 2,
            successRequestCount: 2,
        })
    })

    it('records only provider-reported cache, reasoning, and exact cost details', async () => {
        const recorder = makeRecorder()
        await recorder.recordNextAttempt('success', {
            usage: {
                prompt_tokens: 100,
                completion_tokens: 50,
                prompt_tokens_details: { cached_tokens: 60 },
                completion_tokens_details: { reasoning_tokens: 40 },
                cost: 0.0123,
            },
        })
        await recorder.recordNextAttempt('success', {
            usage: {
                promptTokenCount: 80,
                cachedContentTokenCount: 30,
                candidatesTokenCount: 20,
                thoughtsTokenCount: 10,
            },
        })
        await recorder.finalizeResponse({
            type: 'success',
            result: 'Done',
            usage: {
                input_tokens: 10,
                cache_creation_input_tokens: 20,
                cache_read_input_tokens: 70,
                output_tokens: 25,
            },
        })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            inputTokens: 280,
            outputTokens: 105,
            cachedInputTokens: 180,
            reasoningTokens: 50,
            reportedCostUsd: 0.0123,
            costReportedRequestCount: 1,
        })
    })

    it('recounts locally when a follow-up request has no provider usage', async () => {
        const recorder = makeRecorder()
        const firstInput = { messages: ['first'] }
        const secondInput = { messages: ['second request with tool output'] }
        recorder.prepareAttempt({ input: firstInput })
        await recorder.recordNextAttempt('success', { output: ['tool call'] })
        recorder.prepareAttempt({ input: secondInput })
        await recorder.finalizeResponse({ type: 'success', result: 'Done' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day.inputTokens).toBe(JSON.stringify(firstInput).length + JSON.stringify(secondInput).length)
        expect(day.outputTokens).toBe('tool call'.length + 'Done'.length)
    })

    it('leaves failed attempts without provider cost unreported', async () => {
        const recorder = makeRecorder()
        await recorder.finalizeResponse({ type: 'fail', result: 'Unauthorized' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            failedRequestCount: 1,
            reportedCostUsd: 0,
            costReportedRequestCount: 0,
        })
    })

    it('records explicitly unbilled batch failures as zero cost', async () => {
        const recorder = makeRecorder()
        recorder.prepareAttempt({ input: { messages: ['batch'] } })
        await recorder.finalizeResponse({
            type: 'fail',
            result: 'Batch item errored',
            usageBillingStatus: 'not_billed',
        })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            failedRequestCount: 1,
            reportedCostUsd: 0,
            costReportedRequestCount: 1,
        })
    })

    it('records the provider-resolved model ID instead of the routing model', async () => {
        const recorder = makeRecorder()
        recorder.resolveModel('google/gemma-4-31b-it')
        await recorder.finalizeResponse({ type: 'success', result: 'Done' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day.models).toMatchObject({
            'google/gemma-4-31b-it': {
                requestCount: 1,
                successRequestCount: 1,
            },
        })
        expect(day.models['gpt-5.5']).toBeUndefined()
    })

    it('keeps each provider attempt under the model resolved for that attempt', async () => {
        const recorder = makeRecorder()
        recorder.resolveModel('provider/first-model')
        await recorder.recordNextAttempt('failed')
        recorder.resolveModel('provider/fallback-model')
        await recorder.finalizeResponse({ type: 'success', result: 'Done' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day.models['provider/first-model']).toMatchObject({
            requestCount: 1,
            failedRequestCount: 1,
        })
        expect(day.models['provider/fallback-model']).toMatchObject({
            requestCount: 1,
            successRequestCount: 1,
        })
    })

    it('ignores empty provider model IDs and keeps the routing fallback', async () => {
        const recorder = makeRecorder()
        recorder.resolveModel('   ')
        await recorder.finalizeResponse({ type: 'success', result: 'Done' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day.models['gpt-5.5'].requestCount).toBe(1)
    })

    it('does not turn a finalized failed follow-up into a successful attempt', async () => {
        const recorder = makeRecorder()
        await recorder.recordNextAttempt('success')
        await recorder.finalizeAttempt('failed')
        await recorder.finalizeResponse({ type: 'success', result: 'Partial tool output' })

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            requestCount: 2,
            successRequestCount: 1,
            failedRequestCount: 1,
        })
    })

    it('records only the final cumulative streaming output', async () => {
        const source = new ReadableStream<StreamResponseChunk>({
            start(controller) {
                controller.enqueue({ '0': 'Hi', __thoughts: 'hidden' })
                controller.enqueue({ '0': 'Hello', __thoughts: 'hidden longer' })
                controller.close()
            },
        })
        const response = await makeRecorder({ mode: 'otherAx' }).finalizeResponse({
            type: 'streaming',
            result: source,
        }) as Extract<requestDataResponse, { type: 'streaming' }>
        const reader = response.result.getReader()
        while (!(await reader.read()).done) {
            // Drain the tracked stream.
        }

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            outputTokens: 5,
            successRequestCount: 1,
            requestCountsByMode: { otherAx: 1 },
        })
    })

    it('records partial streaming output when cancelled', async () => {
        const abortController = new AbortController()
        const source = new ReadableStream<StreamResponseChunk>({
            start(controller) {
                controller.enqueue({ '0': 'Partial' })
            },
        })
        const response = await makeRecorder({ abortSignal: abortController.signal }).finalizeResponse({
            type: 'streaming',
            result: source,
        }) as Extract<requestDataResponse, { type: 'streaming' }>
        const reader = response.result.getReader()
        await reader.read()
        abortController.abort()
        await reader.cancel()

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            outputTokens: 7,
            requestCount: 1,
            cancelledRequestCount: 1,
        })
    })

    it('keeps provider usage while recording a terminal streaming failure', async () => {
        const source = new ReadableStream<StreamResponseChunk>({
            start(controller) {
                controller.enqueue({
                    '0': 'Incomplete response',
                    __usage: JSON.stringify({ input_tokens: 23, output_tokens: 4 }),
                    __usageStatus: 'failed',
                })
                controller.close()
            },
        })
        const response = await makeRecorder().finalizeResponse({
            type: 'streaming',
            result: source,
        }) as Extract<requestDataResponse, { type: 'streaming' }>
        const reader = response.result.getReader()
        while (!(await reader.read()).done) {
            // Drain the tracked stream.
        }

        const day = Object.values(ApiUsageState.daily)[0]
        expect(day).toMatchObject({
            inputTokens: 23,
            outputTokens: 4,
            requestCount: 1,
            successRequestCount: 0,
            failedRequestCount: 1,
        })
    })
})
