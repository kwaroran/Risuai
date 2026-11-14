import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('src/lang', () => ({
    language: {}
}))

vi.mock('../alert', () => ({
    alertError: vi.fn(),
    alertInput: vi.fn(),
    waitAlert: vi.fn()
}))

vi.mock('../util', () => ({
    base64url: vi.fn(),
    getKeypairStore: vi.fn(),
    saveKeypairStore: vi.fn()
}))

import { NodeStorage } from './nodeStorage'

describe('NodeStorage.setItem', () => {
    const fetchMock = vi.fn()
    let storage:NodeStorage

    beforeEach(() => {
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
        storage = new NodeStorage()
        vi.spyOn(storage as any, 'checkAuth').mockResolvedValue(undefined)
        vi.spyOn(storage, 'createAuth').mockResolvedValue('test-auth')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('includes storage context and JSON server details for HTTP errors', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({
            error: 'Failed to write storage item',
            code: 'ENOSPC',
            message: "ENOSPC: no space left on device, open './save/64617461626173652f64617461626173652e62696e'"
        }), {
            status: 507,
            statusText: 'Insufficient Storage',
            headers: {
                'content-type': 'application/json'
            }
        }))

        await expect(storage.setItem('database/database.bin', new Uint8Array(2048))).rejects.toThrow(
            'Node storage setItem failed.\n' +
            'Key: database/database.bin\n' +
            'Size: 2048 bytes (2.00 KiB)\n' +
            'HTTP: 507 Insufficient Storage\n' +
            'Server: Failed to write storage item | ENOSPC | ' +
            "ENOSPC: no space left on device, open './save/64617461626173652f64617461626173652e62696e'"
        )
    })

    it('includes structured server details for payload limit errors', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({
            error: 'Storage payload is too large',
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Storage writes are limited to 100 MiB.'
        }), {
            status: 413,
            statusText: 'Payload Too Large',
            headers: {
                'content-type': 'application/json'
            }
        }))

        await expect(storage.setItem('assets/example', new Uint8Array(3))).rejects.toThrow(
            'HTTP: 413 Payload Too Large\n' +
            'Server: Storage payload is too large | PAYLOAD_TOO_LARGE | Storage writes are limited to 100 MiB.'
        )
    })

    it('extracts useful text from an HTML error response', async () => {
        fetchMock.mockResolvedValue(new Response(
            '<!DOCTYPE html><html><body><pre>PayloadTooLargeError: request entity too large<br>at parser</pre></body></html>',
            {
                status: 413,
                statusText: 'Payload Too Large',
                headers: {
                    'content-type': 'text/html'
                }
            }
        ))

        await expect(storage.setItem('assets/example', new Uint8Array(3))).rejects.toThrow(
            'HTTP: 413 Payload Too Large\nServer: PayloadTooLargeError: request entity too large\nat parser'
        )
    })

    it('distinguishes network failures from HTTP failures', async () => {
        fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

        await expect(storage.setItem('database/database.bin', new Uint8Array(3))).rejects.toThrow(
            'Node storage setItem request failed.\n' +
            'Key: database/database.bin\n' +
            'Size: 3 bytes\n' +
            'Cause: Failed to fetch'
        )
    })
})

describe('NodeStorage.getItemsBulk', () => {
    const fetchMock = vi.fn()
    let storage:NodeStorage

    function frame(content:Uint8Array|null) {
        const header = new Uint8Array(4)
        new DataView(header.buffer).setUint32(0, content ? content.byteLength : 0xFFFFFFFF)
        return content ? [header, content] : [header]
    }

    function streamResponse(parts:Uint8Array[], chunkSize:number) {
        const total = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0))
        let offset = 0
        for(const part of parts){
            total.set(part, offset)
            offset += part.byteLength
        }
        let position = 0
        return new Response(new ReadableStream<Uint8Array>({
            pull(controller) {
                if(position >= total.byteLength){
                    controller.close()
                    return
                }
                controller.enqueue(total.slice(position, position + chunkSize))
                position += chunkSize
            }
        }), { status: 200 })
    }

    async function collect(keys:string[]) {
        const result:{ key:string, value:string|null }[] = []
        for await (const { key, value } of storage.getItemsBulk(keys)){
            result.push({ key, value: value ? new TextDecoder().decode(value) : null })
        }
        return result
    }

    beforeEach(() => {
        fetchMock.mockReset()
        vi.stubGlobal('fetch', fetchMock)
        storage = new NodeStorage()
        vi.spyOn(storage as any, 'checkAuth').mockResolvedValue(undefined)
        vi.spyOn(storage, 'createAuth').mockResolvedValue('test-auth')
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it.each([1, 3, 1024])('parses frames split into %i-byte chunks in request order', async (chunkSize) => {
        const encoder = new TextEncoder()
        fetchMock.mockResolvedValue(streamResponse([
            ...frame(encoder.encode('first asset')),
            ...frame(null),
            ...frame(new Uint8Array(0)),
            ...frame(encoder.encode('last')),
        ], chunkSize))

        await expect(collect(['assets/a.png', 'assets/missing.png', 'assets/empty.png', 'assets/b.png'])).resolves.toEqual([
            { key: 'assets/a.png', value: 'first asset' },
            { key: 'assets/missing.png', value: null },
            { key: 'assets/empty.png', value: null },
            { key: 'assets/b.png', value: 'last' },
        ])

        const [url, init] = fetchMock.mock.calls[0]
        expect(url).toBe('/api/read_bulk')
        expect(init.method).toBe('POST')
        expect(init.headers['risu-auth']).toBe('test-auth')
        expect(JSON.parse(init.body)).toEqual({
            paths: ['assets/a.png', 'assets/missing.png', 'assets/empty.png', 'assets/b.png']
                .map((key) => Buffer.from(key, 'utf-8').toString('hex'))
        })
    })

    it('splits requests into batches of at most 100 paths', async () => {
        const keys = Array.from({ length: 250 }, (_, i) => `assets/${i}.png`)
        fetchMock.mockImplementation(async (_url, init) => {
            const count = JSON.parse(init.body).paths.length
            return streamResponse(Array.from({ length: count }, () => frame(null)).flat(), 64)
        })

        const result = await collect(keys)

        expect(result.map((item) => item.key)).toEqual(keys)
        expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body).paths.length)).toEqual([100, 100, 50])
    })

    it('fails when the response is truncated', async () => {
        const encoder = new TextEncoder()
        const [header, content] = frame(encoder.encode('cut short'))
        fetchMock.mockResolvedValue(streamResponse([header, content.subarray(0, 3)], 1024))

        await expect(collect(['assets/a.png'])).rejects.toThrow(
            'Node storage bulk read failed.\nKey: assets/a.png\nCause: response ended before all frames were received'
        )
    })

    it('includes server details for HTTP errors', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'Too many file paths (max 100)' }), {
            status: 400,
            statusText: 'Bad Request',
        }))

        await expect(collect(['assets/a.png'])).rejects.toThrow(
            'Node storage bulk read failed.\nHTTP: 400 Bad Request\nServer: Too many file paths (max 100)'
        )
    })
})
