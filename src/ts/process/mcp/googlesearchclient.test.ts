import { beforeEach, describe, expect, test, vi } from 'vitest'

const store = new Map<string, unknown>()

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: async (key: string) => store.get(key) ?? null,
            setItem: async (key: string, value: unknown) => { store.set(key, value) },
        }),
    },
}))
vi.mock('../../alert', () => ({ alertInput: vi.fn() }))
vi.mock('../../globalApi.svelte', () => ({ fetchNative: vi.fn() }))
vi.mock('./internalmcp', () => ({
    MCPClientLike: class {
        serverInfo = { serverInfo: { name: '', version: '' }, instructions: '' }
        constructor(public url: string) {}
    },
}))

import { alertInput } from '../../alert'
import { fetchNative } from '../../globalApi.svelte'
import {
    DEFAULT_GOOGLE_SEARCH_BASE_URL,
    GoogleSearchClient,
    resolveGoogleSearchBaseUrl,
} from './googlesearchclient'

const okResponse = () => ({
    ok: true,
    json: async () => ({ items: [{ title: 't', link: 'https://example.com', snippet: 's' }] }),
})

async function requestedUrl(): Promise<URL> {
    const client = new GoogleSearchClient()
    await client.checkHandshake()
    await client.callTool('google_search', { query: 'risu' })
    return new URL(vi.mocked(fetchNative).mock.calls[0][0] as string)
}

describe('resolveGoogleSearchBaseUrl', () => {
    test('uses Google when unset or blank', () => {
        expect(resolveGoogleSearchBaseUrl()).toBe('https://customsearch.googleapis.com/customsearch/v1')
        expect(resolveGoogleSearchBaseUrl('  ')).toBe(DEFAULT_GOOGLE_SEARCH_BASE_URL)
    })

    test('keeps an http or https address', () => {
        expect(resolveGoogleSearchBaseUrl(' http://127.0.0.1:8080/customsearch/v1 ')).toBe('http://127.0.0.1:8080/customsearch/v1')
    })

    test('rejects other schemes', () => {
        expect(() => resolveGoogleSearchBaseUrl('file:///etc/passwd')).toThrow()
    })
})

describe('GoogleSearchClient address', () => {
    beforeEach(() => {
        store.clear()
        vi.mocked(fetchNative).mockReset()
        vi.mocked(fetchNative).mockResolvedValue(okResponse() as any)
        vi.mocked(alertInput).mockReset()
    })

    test('credentials saved before this setting existed still call Google', async () => {
        store.set('google-search-creds', { apiKey: 'key', searchEngineId: 'cx' })
        const url = await requestedUrl()
        expect(`${url.origin}${url.pathname}`).toBe(DEFAULT_GOOGLE_SEARCH_BASE_URL)
        expect(url.searchParams.get('cx')).toBe('cx')
        expect(alertInput).not.toHaveBeenCalled()
    })

    test('a stored address is used with the same parameters', async () => {
        store.set('google-search-creds', { apiKey: 'key', searchEngineId: 'cx', baseUrl: 'http://127.0.0.1:8080/customsearch/v1' })
        const url = await requestedUrl()
        expect(`${url.origin}${url.pathname}`).toBe('http://127.0.0.1:8080/customsearch/v1')
        expect(url.searchParams.get('key')).toBe('key')
        expect(url.searchParams.get('q')).toBe('risu')
    })

    test('first setup offers Google as the default address', async () => {
        vi.mocked(alertInput)
            .mockResolvedValueOnce('key')
            .mockResolvedValueOnce('cx')
            .mockImplementationOnce(async (_msg, _list, defaultValue) => defaultValue ?? '')
        const url = await requestedUrl()
        expect(`${url.origin}${url.pathname}`).toBe(DEFAULT_GOOGLE_SEARCH_BASE_URL)
        expect(store.get('google-search-creds')).toEqual({ apiKey: 'key', searchEngineId: 'cx', baseUrl: DEFAULT_GOOGLE_SEARCH_BASE_URL })
    })

    test('first setup stores another address when one is entered', async () => {
        vi.mocked(alertInput)
            .mockResolvedValueOnce('key')
            .mockResolvedValueOnce('cx')
            .mockResolvedValueOnce('https://search.example.com/customsearch/v1')
        const url = await requestedUrl()
        expect(`${url.origin}${url.pathname}`).toBe('https://search.example.com/customsearch/v1')
    })
})
