import { beforeEach, describe, expect, it, vi } from 'vitest'

import { requestGoogleCloudVertex } from './google'

const mocks = vi.hoisted(() => ({
    db: {
        antiServerOverloads: true,
        google: { accessToken: 'google-key' },
        gptVisionQuality: 'high',
        jsonSchemaEnabled: false,
        saveSignatures: false,
        vertexAccessToken: '',
        vertexAccessTokenExpires: Number.MAX_SAFE_INTEGER,
        vertexClientEmail: '',
        vertexPrivateKey: '',
        vertexRegion: 'us-central1',
    },
    fetchNative: vi.fn(),
}))

vi.mock('src/ts/storage/database.svelte', () => ({
    getDatabase: () => mocks.db,
    setDatabase: vi.fn(),
}))

vi.mock('src/ts/globalApi.svelte', () => ({
    addFetchLog: vi.fn(),
    fetchNative: mocks.fetchNative,
    textifyReadableStream: vi.fn(),
}))

vi.mock('src/ts/model/modellist', () => ({
    LLMFlags: {},
    LLMFormat: {
        GoogleCloud: 5,
        VertexAIGemini: 6,
    },
}))

vi.mock('src/ts/util', () => ({
    base64url: vi.fn(),
    simplifySchema: (schema: unknown) => schema,
}))

vi.mock('../files/inlays', () => ({
    saveInlayedSignature: vi.fn(),
    setInlayAsset: vi.fn(),
    writeInlayImage: vi.fn(),
}))

vi.mock('../templates/jsonSchema', () => ({
    extractJSON: (data: string) => data,
    getGeneralJSONSchema: vi.fn(),
}))

vi.mock('../mcp/mcp', () => ({
    callTool: vi.fn(),
    decodeToolCall: vi.fn(),
    encodeToolCall: vi.fn(),
}))

vi.mock('src/ts/alert', () => ({
    alertError: vi.fn(),
}))

vi.mock('src/ts/stores.svelte', () => ({
    bodyIntercepterStore: [],
}))

vi.mock('./shared', () => ({
    applyAdditionalParameters: (body: unknown) => body,
    applyParameters: (body: unknown) => body,
    getAdditionalParameters: () => [],
}))

const overloadResponse = () => ({
    ok: false,
    status: 429,
    text: async () => 'RESOURCE_EXHAUSTED',
})

const successResponse = () => ({
    ok: true,
    status: 200,
    json: async () => ({
        candidates: [{ content: { parts: [{ text: 'Gemini answer' }] } }],
        usageMetadata: {
            promptTokenCount: 13,
            candidatesTokenCount: 4,
        },
    }),
})

const baseArg = (overrides: Record<string, unknown> = {}) => ({
    aiModel: 'gemini-2.5-flash',
    formated: [{ role: 'user', content: 'Hello' }],
    maxTokens: 128,
    mode: 'model',
    modelInfo: {
        flags: [],
        format: 5,
        id: 'gemini-2.5-flash',
        internalID: 'gemini-2.5-flash',
        parameters: [],
    },
    useStreaming: false,
    ...overrides,
}) as any

describe('Gemini usage attempt recording', () => {
    beforeEach(() => {
        mocks.fetchNative.mockReset()
        mocks.db.antiServerOverloads = true
    })

    it('records one failed attempt before a RESOURCE_EXHAUSTED retry succeeds', async () => {
        mocks.fetchNative
            .mockResolvedValueOnce(overloadResponse())
            .mockResolvedValueOnce(successResponse())
        const attempts: string[] = []

        const result = await requestGoogleCloudVertex(baseArg({
            onUsageNextAttempt: async (status: string) => attempts.push(status),
        }))
        attempts.push(result.type === 'success' ? 'success' : 'failed')

        expect(mocks.fetchNative).toHaveBeenCalledTimes(2)
        expect(attempts).toEqual(['failed', 'success'])
        expect(result).toMatchObject({
            type: 'success',
            usage: {
                promptTokenCount: 13,
                candidatesTokenCount: 4,
            },
        })
    })

    it('records every failed RESOURCE_EXHAUSTED attempt before eventual success', async () => {
        mocks.fetchNative
            .mockResolvedValueOnce(overloadResponse())
            .mockResolvedValueOnce(overloadResponse())
            .mockResolvedValueOnce(successResponse())
        const attempts: string[] = []

        const result = await requestGoogleCloudVertex(baseArg({
            onUsageNextAttempt: async (status: string) => attempts.push(status),
        }))
        attempts.push(result.type === 'success' ? 'success' : 'failed')

        expect(mocks.fetchNative).toHaveBeenCalledTimes(3)
        expect(attempts).toEqual(['failed', 'failed', 'success'])
    })

    it('does not fabricate a retry attempt when overload retries are disabled', async () => {
        mocks.db.antiServerOverloads = false
        mocks.fetchNative.mockResolvedValueOnce(overloadResponse())
        const onUsageNextAttempt = vi.fn()

        const result = await requestGoogleCloudVertex(baseArg({
            onUsageNextAttempt,
        }))

        expect(mocks.fetchNative).toHaveBeenCalledTimes(1)
        expect(onUsageNextAttempt).not.toHaveBeenCalled()
        expect(result.type).toBe('fail')
    })
})
