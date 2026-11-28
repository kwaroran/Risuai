import { describe, expect, it } from 'vitest'

import { addOpenRouterAttribution, isOpenRouterUrl, withOpenRouterAttribution } from './openRouterHeaders'

describe('isOpenRouterUrl', () => {
    it('matches openrouter.ai and its subdomains', () => {
        expect(isOpenRouterUrl('https://openrouter.ai/api/v1/chat/completions')).toBe(true)
        expect(isOpenRouterUrl('https://OpenRouter.ai/api/v1/responses')).toBe(true)
        expect(isOpenRouterUrl('https://eu.openrouter.ai/api/v1/chat/completions')).toBe(true)
    })

    it('rejects other hosts and invalid urls', () => {
        expect(isOpenRouterUrl('https://api.openai.com/v1/chat/completions')).toBe(false)
        expect(isOpenRouterUrl('https://notopenrouter.ai/api')).toBe(false)
        expect(isOpenRouterUrl('https://example.com/?u=https://openrouter.ai')).toBe(false)
        expect(isOpenRouterUrl('not a url')).toBe(false)
    })
})

describe('addOpenRouterAttribution', () => {
    it('adds referer and title headers', () => {
        expect(addOpenRouterAttribution({ Authorization: 'Bearer k' })).toEqual({
            Authorization: 'Bearer k',
            'HTTP-Referer': 'https://risuai.xyz',
            'X-OpenRouter-Title': 'Risuai',
            'X-OpenRouter-Categories': 'roleplay,general-chat',
        })
    })

    it('keeps headers the caller already set, case-insensitively', () => {
        expect(addOpenRouterAttribution({
            'http-referer': 'https://plugin.example',
            'X-OpenRouter-Title': 'Plugin',
            'x-openrouter-categories': 'programming-app',
        })).toEqual({
            'http-referer': 'https://plugin.example',
            'X-OpenRouter-Title': 'Plugin',
            'x-openrouter-categories': 'programming-app',
        })
    })

    it('treats the legacy X-Title header as a title override', () => {
        expect(addOpenRouterAttribution({ 'X-Title': 'Plugin' })).toEqual({
            'X-Title': 'Plugin',
            'HTTP-Referer': 'https://risuai.xyz',
            'X-OpenRouter-Categories': 'roleplay,general-chat',
        })
    })
})

describe('withOpenRouterAttribution', () => {
    it('returns a copy with attribution for OpenRouter requests', () => {
        const headers = { Authorization: 'Bearer k' }
        const arg = { method: 'POST', headers }
        const result = withOpenRouterAttribution('https://openrouter.ai/api/v1/chat/completions', arg)
        expect(result).toEqual({
            method: 'POST',
            headers: { Authorization: 'Bearer k', 'HTTP-Referer': 'https://risuai.xyz', 'X-OpenRouter-Title': 'Risuai', 'X-OpenRouter-Categories': 'roleplay,general-chat' },
        })
        expect(headers).toEqual({ Authorization: 'Bearer k' })
    })

    it('handles missing options', () => {
        expect(withOpenRouterAttribution('https://openrouter.ai/api/v1/models')).toEqual({
            headers: { 'HTTP-Referer': 'https://risuai.xyz', 'X-OpenRouter-Title': 'Risuai', 'X-OpenRouter-Categories': 'roleplay,general-chat' },
        })
    })

    it('keeps non-string header values such as secret header references', () => {
        const secret = { secretHeader: 'Authorization' }
        const result = withOpenRouterAttribution('https://openrouter.ai/api/v1/chat/completions', { headers: { Authorization: secret } })
        expect(result?.headers).toMatchObject({ Authorization: secret })
    })

    // Headers may lowercase names depending on the runtime, so compare them case-insensitively.
    const lowercaseNames = (headers: unknown) => Object.fromEntries(Object.entries(headers as Record<string, string>).map(([name, value]) => [name.toLowerCase(), value]))

    it('adds attribution to header lists and Headers objects', () => {
        const expected = {
            authorization: 'Bearer k',
            'http-referer': 'https://risuai.xyz',
            'x-openrouter-title': 'Risuai',
            'x-openrouter-categories': 'roleplay,general-chat',
        }
        expect(lowercaseNames(withOpenRouterAttribution('https://openrouter.ai/api/v1/models', { headers: [['Authorization', 'Bearer k']] })?.headers)).toEqual(expected)
        expect(lowercaseNames(withOpenRouterAttribution('https://openrouter.ai/api/v1/models', { headers: new Headers({ Authorization: 'Bearer k' }) })?.headers)).toEqual(expected)
    })

    it('keeps headers the caller set in a header list', () => {
        const result = withOpenRouterAttribution('https://openrouter.ai/api/v1/models', { headers: [['X-Title', 'Plugin'], ['HTTP-Referer', 'https://plugin.example']] })
        expect(lowercaseNames(result?.headers)).toEqual({
            'x-title': 'Plugin',
            'http-referer': 'https://plugin.example',
            'x-openrouter-categories': 'roleplay,general-chat',
        })
    })

    it('passes invalid header lists through untouched', () => {
        const arg = { headers: [['only-a-name']] }
        expect(withOpenRouterAttribution('https://openrouter.ai/api/v1/models', arg)).toBe(arg)
    })

    it('passes other requests through untouched', () => {
        const arg = { headers: { Authorization: 'Bearer k' } }
        expect(withOpenRouterAttribution('https://api.openai.com/v1/chat/completions', arg)).toBe(arg)
        expect(withOpenRouterAttribution('https://api.openai.com/v1/chat/completions')).toBeUndefined()
    })
})
