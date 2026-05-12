import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LLMFlags, LLMFormat, LLMProvider, LLMTokenizer } from 'src/ts/model/types'
import { __testResponsesAPI, requestOpenAIResponseAPI } from './requests'

const mocks = vi.hoisted(() => ({
    db: {
        OaiCompAPIKeys: {},
        additionalParams: [],
        autofillRequestUrl: false,
        customModels: [],
        gptVisionQuality: 'high',
        jsonSchema: '{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}',
        jsonSchemaEnabled: false,
        localNetworkMode: false,
        modelTools: [] as string[],
        newOAIHandle: true,
        nanogptKey: 'nanogpt-key',
        nanogptProvider: '',
        nanogptRequestModel: 'nanogpt-model',
        nanogptUseSubscriptionEndpoint: false,
        openAIKey: 'openai-key',
        proxyKey: 'proxy-key',
        requestRetrys: 0,
        reasoningEffort: 2,
        seperateParametersEnabled: false,
        simplifiedToolUse: false,
        strictJsonSchema: true,
        temperature: 70,
        top_p: 0.9,
        verbosity: 0,
    },
    globalFetch: vi.fn(),
}))

vi.mock('src/ts/storage/database.svelte', () => ({
    getDatabase: () => mocks.db,
}))

vi.mock('src/ts/globalApi.svelte', () => ({
    addFetchLog: vi.fn(),
    fetchNative: vi.fn(),
    globalFetch: mocks.globalFetch,
    textifyReadableStream: vi.fn(),
}))

vi.mock('src/lang', () => ({
    language: { errors: { httpError: 'HTTP ' } },
}))

vi.mock('src/ts/alert', () => ({
    alertError: vi.fn(),
}))

vi.mock('src/ts/platform', () => ({
    isNodeServer: true,
    isTauri: false,
}))

vi.mock('src/ts/network/localNetwork', () => ({
    isLocalNetworkUrl: () => false,
}))

vi.mock('../../templates/jsonSchema', () => ({
    extractJSON: (data: string) => data,
    getOpenAIJSONSchema: () => ({
        name: 'format',
        strict: true,
        schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false },
    }),
}))

vi.mock('src/ts/process/templates/jsonSchema', () => ({
    extractJSON: (data: string) => data,
    getOpenAIJSONSchema: () => ({
        name: 'format',
        strict: true,
        schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false },
    }),
}))

vi.mock('../../templates/chatTemplate', () => ({
    applyChatTemplate: vi.fn(),
}))

vi.mock('src/ts/process/templates/chatTemplate', () => ({
    applyChatTemplate: vi.fn(),
}))

vi.mock('src/ts/model/modellist', () => ({
    LLMFlags: {
        DeveloperRole: 14,
        OAICompletionTokens: 13,
        deepSeekPrefix: 17,
        deepSeekThinkingInput: 18,
        deepSeekThinkingOutput: 19,
        deepSeekThinkingToggle: 24,
    },
    LLMFormat: {
        Mistral: 4,
        OpenAIResponseAPI: 18,
    },
    getFreeOpenRouterModels: vi.fn(),
}))

vi.mock('src/ts/tokenizer', () => ({
    strongBan: vi.fn(),
    tokenizeNum: vi.fn(),
}))

vi.mock('src/ts/model/openrouter', () => ({
    getFreeOpenRouterModels: vi.fn(),
}))

vi.mock('src/ts/util', () => ({
    simplifySchema: (schema: unknown) => schema,
}))

vi.mock('../../files/inlays', () => ({
    supportsInlayImage: () => false,
}))

vi.mock('../../mcp/mcp', () => ({
    callTool: vi.fn(),
    decodeToolCall: vi.fn(),
    encodeToolCall: vi.fn(),
}))

const baseArg = (overrides: Record<string, any> = {}) => ({
    aiModel: 'gpt-5-response-api',
    bias: {},
    biasString: [],
    formated: [
        { role: 'system', content: 'Follow policy.' },
        { role: 'user', content: 'Describe this.', multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }] },
        { role: 'assistant', content: 'Previous assistant prefill' },
        { role: 'user', content: 'Also read file.', multimodals: [{ type: 'audio', base64: 'data:application/pdf;base64,def' }] },
    ],
    maxTokens: 321,
    mode: 'model',
    modelInfo: {
        flags: [LLMFlags.DeveloperRole],
        format: LLMFormat.OpenAIResponseAPI,
        id: 'gpt-5-response-api',
        internalID: 'gpt-5',
        name: 'GPT-5 Responses',
        parameters: ['temperature', 'top_p', 'reasoning_effort', 'verbosity'],
        provider: LLMProvider.OpenAI,
        tokenizer: LLMTokenizer.Unknown,
    },
    ...overrides,
}) as any

async function collectStream(stream: ReadableStream<Record<string, string>>) {
    const reader = stream.getReader()
    const chunks: Record<string, string>[] = []
    while(true){
        const { done, value } = await reader.read()
        if(done){
            return chunks
        }
        chunks.push(value)
    }
}

describe('OpenAI Responses API helpers', () => {
    beforeEach(() => {
        mocks.globalFetch.mockReset()
        mocks.db.OaiCompAPIKeys = {}
        mocks.db.additionalParams = []
        mocks.db.jsonSchemaEnabled = false
        mocks.db.modelTools = []
        mocks.db.customModels = []
        mocks.db.nanogptProvider = ''
        mocks.db.nanogptRequestModel = 'nanogpt-model'
        mocks.db.nanogptUseSubscriptionEndpoint = false
        mocks.db.simplifiedToolUse = false
        mocks.db.autofillRequestUrl = false
    })

    it('builds a Responses request body for text, developer role, multimodal input, tools, and model parameters', async () => {
        mocks.db.modelTools = ['search']
        const sourceMessages = baseArg().formated

        const body = await __testResponsesAPI.buildResponsesBody(baseArg({
            formated: sourceMessages,
            schema: '{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"],"additionalProperties":false}',
            tools: [{ name: 'lookup', description: 'Lookup data', inputSchema: { type: 'object', properties: { query: { type: 'string' } } } }],
        }))

        expect(body).toMatchObject({
            model: 'gpt-5',
            max_output_tokens: 321,
            store: false,
            temperature: 0.7,
            top_p: 0.9,
            reasoning: { effort: 'high' },
            text: {
                verbosity: 'low',
                format: {
                    type: 'json_schema',
                    name: 'format',
                    strict: true,
                },
            },
        })
        expect(body.input[0]).toMatchObject({ role: 'developer', content: [{ type: 'input_text', text: 'Follow policy.' }] })
        expect(body.input[1].content).toEqual([
            { type: 'input_text', text: 'Describe this.' },
            { type: 'input_image', detail: 'high', image_url: 'data:image/png;base64,abc' },
        ])
        expect(body.input[2]).toMatchObject({
            role: 'assistant',
            type: 'message',
            content: [{ type: 'output_text', text: 'Previous assistant prefill', annotations: [] }],
        })
        expect(body.input[3].content).toEqual([
            { type: 'input_text', text: 'Also read file.' },
            { type: 'input_file', file_data: 'data:application/pdf;base64,def' },
        ])
        expect(body.tools).toEqual([
            { type: 'function', name: 'lookup', description: 'Lookup data', parameters: { type: 'object', properties: { query: { type: 'string' } } } },
            { type: 'web_search_preview' },
        ])
        expect(sourceMessages[1]).toMatchObject({ role: 'user', content: 'Describe this.', multimodals: [{ type: 'image', base64: 'data:image/png;base64,abc' }] })
    })

    it('uses OpenAI defaults and an externally clean non-streaming body', async () => {
        mocks.globalFetch.mockResolvedValueOnce({
            ok: true,
            data: { output_text: 'ok' },
        })

        const result = await requestOpenAIResponseAPI(baseArg())

        expect(result).toEqual({ type: 'success', result: 'ok' })
        expect(mocks.globalFetch).toHaveBeenCalledWith('https://api.openai.com/v1/responses', expect.objectContaining({
            body: expect.objectContaining({
                model: 'gpt-5',
                stream: false,
            }),
            headers: expect.objectContaining({ Authorization: 'Bearer openai-key' }),
        }))
        expect(mocks.globalFetch.mock.calls[0][1].body).not.toHaveProperty('__lastOutput')
    })

    it('leaves system messages as system without the developer-role flag', async () => {
        const body = await __testResponsesAPI.buildResponsesBody(baseArg({
            modelInfo: {
                ...baseArg().modelInfo,
                flags: [],
            },
        }))

        expect(body.input[0]).toMatchObject({ role: 'system', content: [{ type: 'input_text', text: 'Follow policy.' }] })
    })

    it('applies custom model Responses endpoint, key, and additional params', async () => {
        mocks.db.OaiCompAPIKeys = { customKey: 'custom-key' }
        mocks.db.customModels = [{
            id: 'xcustom:::responses',
            params: 'header::X-Custom=yes\nmetadata.tier=gold\nextra=json::{"enabled":true}',
        }]

        const result = await requestOpenAIResponseAPI(baseArg({
            aiModel: 'xcustom:::responses',
            previewBody: true,
            modelInfo: {
                ...baseArg().modelInfo,
                endpoint: 'https://custom.example/v1/responses',
                keyIdentifier: 'customKey',
            },
        }))

        expect(result.type).toBe('success')
        const preview = JSON.parse(result.result as string)
        expect(preview.url).toBe('https://custom.example/v1/responses')
        expect(preview.headers.Authorization).toBe('Bearer custom-key')
        expect(preview.headers['X-Custom']).toBe('yes')
        expect(preview.body.metadata.tier).toBe('gold')
        expect(preview.body.extra).toEqual({ enabled: true })
    })

    it('does not duplicate top-level output_text when message output blocks are also present', () => {
        const text = __testResponsesAPI.extractResponsesText({
            output_text: 'final text',
            output: [{ type: 'message', content: [{ type: 'output_text', text: 'final text' }] }],
        }, baseArg())

        expect(text).toBe('final text')
    })

    it('preserves reasoning summaries and refusal-only responses', () => {
        expect(__testResponsesAPI.extractResponsesText({
            output: [
                { type: 'reasoning', summary: [{ text: 'reasoned' }] },
                { type: 'message', content: [{ type: 'output_text', text: 'answer' }] },
            ],
        }, baseArg())).toBe('<Thoughts>\nreasoned\n</Thoughts>\nanswer')

        expect(__testResponsesAPI.extractResponsesText({
            output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'Cannot comply.' }] }],
        }, baseArg())).toBe('Cannot comply.')
    })

    it('treats incomplete non-streaming Responses results as failures even when partial text exists', async () => {
        mocks.globalFetch.mockResolvedValueOnce({
            ok: true,
            data: {
                status: 'incomplete',
                incomplete_details: { reason: 'max_output_tokens' },
                output_text: 'partial',
            },
        })

        const result = await requestOpenAIResponseAPI(baseArg())

        expect(result).toEqual({ type: 'fail', result: 'Incomplete response: max_output_tokens\npartial' })
    })

    it('treats failed non-streaming Responses results as useful failures', async () => {
        mocks.globalFetch.mockResolvedValueOnce({
            ok: true,
            data: {
                status: 'failed',
                error: { message: 'bad request' },
            },
        })

        const result = await requestOpenAIResponseAPI(baseArg())

        expect(result).toEqual({ type: 'fail', result: '{"message":"bad request"}' })
    })

    it('handles an omitted aiModel in the Responses path without crashing', async () => {
        const result = await requestOpenAIResponseAPI(baseArg({
            aiModel: undefined,
            previewBody: true,
            modelInfo: {
                ...baseArg().modelInfo,
                internalID: undefined,
            },
        }))

        expect(result.type).toBe('success')
        const preview = JSON.parse(result.result as string)
        expect(preview.url).toBe('https://api.openai.com/v1/responses')
        expect(preview.body.model).toBe('gpt-4.1')
    })

    it('wires NanoGPT Responses endpoint, model, auth, and provider header', async () => {
        mocks.db.nanogptProvider = 'provider-a'

        const result = await requestOpenAIResponseAPI(baseArg({
            aiModel: 'nanogpt',
            previewBody: true,
            modelInfo: {
                ...baseArg().modelInfo,
                internalID: 'nanogpt',
                format: LLMFormat.NanoGPTResponses,
            },
        }))

        expect(result.type).toBe('success')
        const preview = JSON.parse(result.result as string)
        expect(preview.url).toBe('https://nano-gpt.com/api/v1/responses')
        expect(preview.body.model).toBe('nanogpt-model')
        expect(preview.headers.Authorization).toBe('Bearer nanogpt-key')
        expect(preview.headers['X-Provider']).toBe('provider-a')
    })

    it('applies reverse proxy Responses endpoint autofill and additional params', async () => {
        mocks.db.autofillRequestUrl = true
        mocks.db.additionalParams = [
            ['header::X-Test', 'ok'],
            ['metadata.source', 'risu'],
        ]

        const result = await requestOpenAIResponseAPI(baseArg({
            aiModel: 'reverse_proxy',
            customURL: 'https://proxy.example/api',
            previewBody: true,
            key: undefined,
        }))

        expect(result.type).toBe('success')
        const preview = JSON.parse(result.result as string)
        expect(preview.url).toBe('https://proxy.example/api/v1/responses')
        expect(preview.headers.Authorization).toBe('Bearer proxy-key')
        expect(preview.headers['X-Test']).toBe('ok')
        expect(preview.body.metadata.source).toBe('risu')
    })

    it('strips internal Responses continuation state from external request bodies', () => {
        expect(__testResponsesAPI.toExternalResponsesBody({
            model: 'gpt-5',
            input: [],
            __lastOutput: [{ type: 'function_call', call_id: 'call_1' }],
        })).toEqual({ model: 'gpt-5', input: [] })
    })

    it('parses split CRLF SSE chunks, final unterminated events, text deltas, and function call deltas', async () => {
        const stream = __testResponsesAPI.getResponsesTranStream(baseArg())
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()

        await writer.write(encoder.encode('data: {"type":"response.output_text.delta","delta":"Hel"}\r\n\r'))
        await writer.write(encoder.encode('\ndata: {"type":"response.output_text.delta","delta":"lo"}\r\n\r\n'))
        await writer.write(encoder.encode('data: {"type":"response.function_call_arguments.delta","call_id":"call_1","delta":"{\\"q\\":"}\r\n\r\n'))
        await writer.write(encoder.encode('data: {"type":"response.output_item.done","item":{"type":"function_call","call_id":"call_1","name":"lookup","arguments":"{\\"q\\":\\"x\\"}","status":"completed"}}'))
        await writer.close()

        const chunks = await chunksPromise
        expect(chunks.at(-1)).toEqual({
            '0': 'Hello',
            __tool_calls: JSON.stringify({
                call_1: { type: 'function_call', call_id: 'call_1', name: 'lookup', arguments: '{"q":"x"}', status: 'completed' },
            }),
        })
    })

    it('does not duplicate text from a completed streaming event', async () => {
        const stream = __testResponsesAPI.getResponsesTranStream(baseArg())
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()

        await writer.write(encoder.encode('data: {"type":"response.output_text.delta","delta":"Hello"}\n\n'))
        await writer.write(encoder.encode('data: {"type":"response.completed","response":{"output_text":"Hello","output":[{"type":"message","content":[{"type":"output_text","text":"Hello"}]}]}}\n\n'))
        await writer.close()

        const chunks = await chunksPromise
        expect(chunks.at(-1)?.['0']).toBe('Hello')
    })

    it('emits useful text for streaming error events', async () => {
        const stream = __testResponsesAPI.getResponsesTranStream(baseArg())
        const chunksPromise = collectStream(stream.readable)
        const writer = stream.writable.getWriter()
        const encoder = new TextEncoder()

        await writer.write(encoder.encode('data: {"type":"response.failed","error":{"message":"stream failed"}}\n\n'))
        await writer.close()

        const chunks = await chunksPromise
        expect(chunks.at(-1)?.['0']).toContain('stream failed')
    })
})
