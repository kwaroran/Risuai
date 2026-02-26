import { describe, expect, it } from 'vitest'

import { decodeProxyJobWsChunk, formatProxyStreamErrorMessage, parseProxyJobWsEvent } from './proxyJobWs'

describe('parseProxyJobWsEvent', () => {
    it('parses valid proxy job events', () => {
        const event = parseProxyJobWsEvent(JSON.stringify({
            type: 'chunk',
            dataBase64: Buffer.from('hello', 'utf-8').toString('base64')
        }))
        expect(event).not.toBeNull()
        expect(event?.type).toBe('chunk')
    })

    it('returns null for invalid input', () => {
        expect(parseProxyJobWsEvent('not-json')).toBeNull()
        expect(parseProxyJobWsEvent(JSON.stringify({ nope: 1 }))).toBeNull()
    })
})

describe('decodeProxyJobWsChunk', () => {
    it('decodes base64 payload into bytes', () => {
        const bytes = decodeProxyJobWsChunk(Buffer.from('abc', 'utf-8').toString('base64'))
        expect(new TextDecoder().decode(bytes)).toBe('abc')
    })
})

describe('formatProxyStreamErrorMessage', () => {
    it('maps cloudflare/origin timeout errors to clear message', () => {
        const msg = formatProxyStreamErrorMessage(504, '<!DOCTYPE html><title>Gateway time-out</title>')
        expect(msg).toContain('Cloudflare/origin timeout')
    })

    it('passes through non-timeout messages', () => {
        expect(formatProxyStreamErrorMessage(400, 'bad request')).toBe('bad request')
    })
})
