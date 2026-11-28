import crc32 from 'crc/crc32'
import * as fflate from 'fflate'
import { describe, expect, test } from 'vitest'
import {
    extractMetadataFromBytes,
    extractStealthMetadataFromPixels,
    injectMetadataIntoImage,
} from '../inlayMetadata'

const enc = new TextEncoder()
const latin1 = new TextDecoder('latin1')

function makeMinimalPng(chunks: { type: string; data: Uint8Array }[] = []): Uint8Array {
    const encodeChunk = (type: string, data: Uint8Array) => {
        const out = new Uint8Array(12 + data.length)
        const view = new DataView(out.buffer)
        view.setUint32(0, data.length, false)
        for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
        out.set(data, 8)
        view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length) as Buffer) >>> 0, false)
        return out
    }
    const parts = [
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        encodeChunk('IHDR', new Uint8Array([0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])),
        ...chunks.map((c) => encodeChunk(c.type, c.data)),
        encodeChunk('IDAT', fflate.zlibSync(new Uint8Array([0, 0, 0, 0]))),
        encodeChunk('IEND', new Uint8Array(0)),
    ]
    const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0))
    let off = 0
    for (const p of parts) {
        out.set(p, off)
        off += p.length
    }
    return out
}

function makeMinimalWebp(withVp8x: boolean): Uint8Array {
    const body = withVp8x
        ? new Uint8Array([
              ...enc.encode('VP8X'), 10, 0, 0, 0, 0x10, 0, 0, 0, 0, 0, 0, 0, 0, 0,
              ...enc.encode('VP8 '), 6, 0, 0, 0, 0, 0, 0, 0, 0, 0,
          ])
        : new Uint8Array([...enc.encode('VP8 '), 10, 0, 0, 0, ...new Uint8Array(10)])
    const out = new Uint8Array(12 + body.length)
    out.set(enc.encode('RIFF'), 0)
    new DataView(out.buffer).setUint32(4, 4 + body.length, true)
    out.set(enc.encode('WEBP'), 8)
    out.set(body, 12)
    return out
}

function readWebpExif(webp: Uint8Array): Uint8Array | null {
    const view = new DataView(webp.buffer, webp.byteOffset, webp.byteLength)
    let pos = 12
    while (pos + 8 <= webp.length) {
        const type = latin1.decode(webp.subarray(pos, pos + 4))
        const len = view.getUint32(pos + 4, true)
        if (type === 'EXIF') return webp.subarray(pos + 8, pos + 8 + len)
        pos += 8 + len + (len & 1)
    }
    return null
}

function readJpegExif(jpeg: Uint8Array): Uint8Array | null {
    let pos = 2
    while (pos + 4 <= jpeg.length && jpeg[pos] === 0xff) {
        const marker = jpeg[pos + 1]
        if (marker === 0xd9 || marker === 0xda) break
        const segLen = (jpeg[pos + 2] << 8) | jpeg[pos + 3]
        if (marker === 0xe1 && latin1.decode(jpeg.subarray(pos + 4, pos + 10)) === 'Exif\x00\x00') {
            return jpeg.subarray(pos + 10, pos + 2 + segLen)
        }
        pos += 2 + segLen
    }
    return null
}

describe('inlayMetadata', () => {
    test('extracts PNG tEXt and UTF-8 iTXt chunks and restores them with valid CRC32', () => {
        const textData = new Uint8Array([...enc.encode('Software'), 0, ...enc.encode('NovelAI')])
        const itxtData = new Uint8Array([...enc.encode('Description'), 0, 0, 0, 0, 0, ...enc.encode('1girl, 한글 프롬프트')])
        const png = makeMinimalPng([
            { type: 'tEXt', data: textData },
            { type: 'iTXt', data: itxtData },
        ])

        const meta = extractMetadataFromBytes(png)
        expect(meta.textChunks).toEqual({
            Software: 'NovelAI',
            Description: '1girl, 한글 프롬프트',
        })

        const restored = injectMetadataIntoImage(makeMinimalPng(), 'png', meta, 1, 1)
        expect(extractMetadataFromBytes(restored).textChunks).toEqual(meta.textChunks)

        const view = new DataView(restored.buffer, restored.byteOffset, restored.byteLength)
        let pos = 8
        while (pos + 12 <= restored.length) {
            const len = view.getUint32(pos, false)
            expect(view.getUint32(pos + 8 + len, false)).toBe(
                crc32(restored.subarray(pos + 4, pos + 8 + len) as Buffer) >>> 0,
            )
            pos += 12 + len
        }
    })

    test('extracts NovelAI stealth_pngcomp metadata from column-major alpha LSBs', () => {
        const width = 64
        const height = 160
        const payload = { Description: '1girl, 한글 태그', Comment: '{"seed":42}' }
        const gz = fflate.gzipSync(enc.encode(JSON.stringify(payload)))
        const bitLen = gz.length * 8
        const stream = new Uint8Array([
            ...enc.encode('stealth_pngcomp'),
            (bitLen >>> 24) & 0xff,
            (bitLen >>> 16) & 0xff,
            (bitLen >>> 8) & 0xff,
            bitLen & 0xff,
            ...gz,
        ])
        const rgba = new Uint8ClampedArray(width * height * 4).fill(255)
        let x = 0
        let y = 0
        for (const byte of stream) {
            for (let b = 7; b >= 0; b--) {
                rgba[(y * width + x) * 4 + 3] = ((byte >>> b) & 1) === 1 ? 255 : 254
                if (++y === height) {
                    y = 0
                    x++
                }
            }
        }

        expect(extractStealthMetadataFromPixels(rgba, width, height)).toEqual(payload)
    })

    test('injects ComfyUI, NAI, and WebUI EXIF into WebP (upgrading VP8 and preserving VP8X flags)', () => {
        const upgraded = injectMetadataIntoImage(
            makeMinimalWebp(false),
            'webp',
            {
                textChunks: {
                    prompt: '{"1":{"class_type":"KSampler"}}',
                    workflow: '{"nodes":[{"id":1}]}',
                    Description: '1girl, 한글',
                    Comment: '{"seed":123}',
                },
                rawPngChunks: [],
            },
            832,
            1216,
        )
        expect(latin1.decode(upgraded.subarray(12, 16))).toBe('VP8X')
        expect(upgraded[20]).toBe(0x08)
        expect((upgraded[24] | (upgraded[25] << 8) | (upgraded[26] << 16)) + 1).toBe(832)
        expect((upgraded[27] | (upgraded[28] << 8) | (upgraded[29] << 16)) + 1).toBe(1216)

        const exifText = latin1.decode(readWebpExif(upgraded)!)
        expect(exifText).toContain('prompt:{"1":{"class_type":"KSampler"}}')
        expect(exifText).toContain('workflow:{"nodes":[{"id":1}]}')
        expect(exifText).toContain('ASCII\x00\x00\x00')
        expect(exifText).toContain('"Comment":"{\\"seed\\":123}"')
        expect(exifText).toContain('\\ud55c\\uae00')

        // Existing VP8X alpha bit stays set, and WebUI parameters stays plain text even with extra Software key
        const webuiOut = injectMetadataIntoImage(
            makeMinimalWebp(true),
            'webp',
            {
                textChunks: {
                    parameters: '1girl, Steps: 20',
                    Software: 'Automatic1111',
                },
                rawPngChunks: [],
            },
            512,
            512,
        )
        expect(webuiOut[20]).toBe(0x18)
        expect(latin1.decode(readWebpExif(webuiOut)!)).toContain('ASCII\x00\x00\x001girl, Steps: 20')
    })

    test('injects EXIF into JPEG after APP0 and drops oversized ComfyUI workflow to fit 64KB limit', () => {
        const jpeg = new Uint8Array([
            0xff, 0xd8,
            0xff, 0xe0, 0x00, 0x07, 0x4a, 0x46, 0x49, 0x46, 0x00,
            0xff, 0xd9,
        ])

        const normal = injectMetadataIntoImage(
            jpeg,
            'jpeg',
            { textChunks: { prompt: '{"1":{}}', workflow: '{"nodes":[]}' }, rawPngChunks: [] },
            768,
            1344,
        )
        expect(normal[2]).toBe(0xff)
        expect(normal[3]).toBe(0xe0)
        const normalExif = latin1.decode(readJpegExif(normal)!)
        expect(normalExif).toContain('prompt:{"1":{}}')
        expect(normalExif).toContain('workflow:{"nodes":[]}')

        const slim = injectMetadataIntoImage(
            jpeg,
            'jpeg',
            {
                textChunks: {
                    prompt: '{"1":{}}',
                    workflow: '{"pad":"' + 'x'.repeat(70000) + '"}',
                },
                rawPngChunks: [],
            },
            768,
            1344,
        )
        const slimExif = latin1.decode(readJpegExif(slim)!)
        expect(slimExif).toContain('prompt:{"1":{}}')
        expect(slimExif).not.toContain('workflow:')
    })
})
