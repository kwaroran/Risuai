import { describe, expect, it } from 'vitest'

import { isLocalNetworkHost, isLocalNetworkUrl } from './localNetwork'

describe('isLocalNetworkHost', () => {
    it('accepts localhost and loopback hosts', () => {
        expect(isLocalNetworkHost('localhost')).toBe(true)
        expect(isLocalNetworkHost('127.0.0.1')).toBe(true)
        expect(isLocalNetworkHost('0.0.0.0')).toBe(true)
        expect(isLocalNetworkHost('::1')).toBe(true)
    })

    it('accepts private and link-local IPv4 ranges', () => {
        expect(isLocalNetworkHost('10.1.2.3')).toBe(true)
        expect(isLocalNetworkHost('172.16.0.1')).toBe(true)
        expect(isLocalNetworkHost('172.31.255.254')).toBe(true)
        expect(isLocalNetworkHost('192.168.10.20')).toBe(true)
        expect(isLocalNetworkHost('169.254.12.34')).toBe(true)
    })

    it('accepts local IPv6 ranges and .local suffix', () => {
        expect(isLocalNetworkHost('fc00::1')).toBe(true)
        expect(isLocalNetworkHost('fd12:3456:789a::1')).toBe(true)
        expect(isLocalNetworkHost('fe80::1234')).toBe(true)
        expect(isLocalNetworkHost('model-server.local')).toBe(true)
        expect(isLocalNetworkHost('litellm')).toBe(true)
    })

    it('rejects public hosts', () => {
        expect(isLocalNetworkHost('8.8.8.8')).toBe(false)
        expect(isLocalNetworkHost('1.1.1.1')).toBe(false)
        expect(isLocalNetworkHost('api.openai.com')).toBe(false)
        expect(isLocalNetworkHost('2001:4860:4860::8888')).toBe(false)
    })
})

describe('isLocalNetworkUrl', () => {
    it('accepts local URLs', () => {
        expect(isLocalNetworkUrl('http://192.168.0.10:11435/v1')).toBe(true)
        expect(isLocalNetworkUrl('http://localhost:8080')).toBe(true)
        expect(isLocalNetworkUrl('http://[fd00::1]:4000/v1')).toBe(true)
        expect(isLocalNetworkUrl('http://my-box.local/v1/chat/completions')).toBe(true)
        expect(isLocalNetworkUrl('http://litellm:4000/v1/chat/completions')).toBe(true)
    })

    it('rejects public URLs', () => {
        expect(isLocalNetworkUrl('https://api.openai.com/v1/chat/completions')).toBe(false)
        expect(isLocalNetworkUrl('https://example.com')).toBe(false)
    })

    it('rejects invalid URLs', () => {
        expect(isLocalNetworkUrl('')).toBe(false)
        expect(isLocalNetworkUrl('not-a-url')).toBe(false)
    })
})
