import crc32 from 'crc/crc32'
import * as fflate from 'fflate'
import type { InlayImageFormat } from '../../storage/database.svelte'

type RawPngChunk = {
    type: string
    data: Uint8Array
}

export type ExtractedImageMetadata = {
    textChunks: Record<string, string>
    rawPngChunks: RawPngChunk[]
}

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const EXIF_HEADER = new Uint8Array([0x45, 0x78, 0x69, 0x66, 0x00, 0x00])
const ASCII_COMMENT_PREFIX = new Uint8Array([0x41, 0x53, 0x43, 0x49, 0x49, 0x00, 0x00, 0x00])
const UNICODE_COMMENT_PREFIX = new Uint8Array([0x55, 0x4e, 0x49, 0x43, 0x4f, 0x44, 0x45, 0x00])

// JPEG APP1 segment max length is 0xFFFF (includes 2-byte length + 6-byte "Exif\0\0")
const MAX_JPEG_EXIF_TIFF_BYTES = 0xffff - 2 - 6

const COMFY_KEYS = new Set(['prompt', 'workflow', 'workflow_api'])

const textEncoder = new TextEncoder()
const utf8Decoder = new TextDecoder('utf-8', { fatal: false })
const latin1Decoder = new TextDecoder('latin1')

function hasPrefix(bytes: Uint8Array, prefix: Uint8Array): boolean {
    if (bytes.length < prefix.length) return false
    for (let i = 0; i < prefix.length; i++) {
        if (bytes[i] !== prefix[i]) return false
    }
    return true
}

function readFourCC(bytes: Uint8Array, offset: number): string {
    return String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3],
    )
}

function writeFourCC(target: Uint8Array, offset: number, fourcc: string): void {
    for (let i = 0; i < 4; i++) {
        target[offset + i] = fourcc.charCodeAt(i) & 0xff
    }
}

function isPureAscii(str: string): boolean {
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) > 0x7f) return false
    }
    return true
}

/**
 * Escapes non-ASCII characters as \uXXXX so EXIF ASCII UserComment stays compact
 * and compatible with NovelAI Inspect and Pillow.
 */
function jsonStringifyAscii(value: unknown): string {
    return JSON.stringify(value).replace(/[^\x00-\x7f]/g, (ch) => {
        return '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0')
    })
}

function encodeAsciiBytes(str: string): Uint8Array {
    const out = new Uint8Array(str.length)
    for (let i = 0; i < str.length; i++) {
        out[i] = str.charCodeAt(i) & 0x7f
    }
    return out
}

function encodeUtf16BE(str: string): Uint8Array {
    const out = new Uint8Array(str.length * 2)
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i)
        out[i * 2] = (code >>> 8) & 0xff
        out[i * 2 + 1] = code & 0xff
    }
    return out
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
    let total = 0
    for (const p of parts) total += p.length
    const out = new Uint8Array(total)
    let offset = 0
    for (const p of parts) {
        out.set(p, offset)
        offset += p.length
    }
    return out
}

export function dataUriToUint8Array(dataUri: string): Uint8Array | null {
    if (!dataUri.startsWith('data:')) return null
    const commaIdx = dataUri.indexOf(',')
    if (commaIdx === -1 || !dataUri.slice(5, commaIdx).includes(';base64')) return null
    try {
        const bin = atob(dataUri.slice(commaIdx + 1))
        const out = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) {
            out[i] = bin.charCodeAt(i)
        }
        return out
    } catch {
        return null
    }
}

export function hasMetadata(
    meta: ExtractedImageMetadata | null | undefined,
): meta is ExtractedImageMetadata {
    return !!meta && (Object.keys(meta.textChunks).length > 0 || meta.rawPngChunks.length > 0)
}

export function extractMetadataFromBytes(bytes: Uint8Array): ExtractedImageMetadata {
    const textChunks: Record<string, string> = {}
    const rawPngChunks: RawPngChunk[] = []
    if (!hasPrefix(bytes, PNG_SIG)) {
        return { textChunks, rawPngChunks }
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let pos = 8

    while (pos + 12 <= bytes.length) {
        const len = view.getUint32(pos, false)
        const type = readFourCC(bytes, pos + 4)
        const dataStart = pos + 8
        const dataEnd = dataStart + len
        if (dataEnd + 4 > bytes.length) break
        const data = bytes.subarray(dataStart, dataEnd)

        if (type === 'tEXt') {
            rawPngChunks.push({ type, data: data.slice() })
            const nul = data.indexOf(0)
            if (nul > 0) {
                textChunks[latin1Decoder.decode(data.subarray(0, nul))] =
                    latin1Decoder.decode(data.subarray(nul + 1))
            }
        } else if (type === 'iTXt') {
            rawPngChunks.push({ type, data: data.slice() })
            const nul1 = data.indexOf(0)
            if (nul1 > 0 && nul1 + 3 <= data.length) {
                const key = latin1Decoder.decode(data.subarray(0, nul1))
                const compFlag = data[nul1 + 1]
                const compMethod = data[nul1 + 2]
                const nul2 = data.indexOf(0, nul1 + 3)
                const nul3 = nul2 !== -1 ? data.indexOf(0, nul2 + 1) : -1
                if (nul3 !== -1) {
                    const textData = data.subarray(nul3 + 1)
                    try {
                        if (compFlag === 1 && compMethod === 0) {
                            textChunks[key] = utf8Decoder.decode(fflate.unzlibSync(textData))
                        } else if (compFlag === 0) {
                            textChunks[key] = utf8Decoder.decode(textData)
                        }
                    } catch {
                        // ignore malformed iTXt payload
                    }
                }
            }
        } else if (type === 'IEND') {
            break
        }

        pos = dataEnd + 4
    }

    return { textChunks, rawPngChunks }
}

/**
 * Extracts NovelAI `stealth_pngcomp` metadata stored in the alpha channel's
 * least significant bits in column-major order.
 */
export function extractStealthMetadataFromPixels(
    rgba: Uint8ClampedArray | Uint8Array,
    width: number,
    height: number,
): Record<string, string> | null {
    const totalPixels = width * height
    // 15-byte signature (120 bits) + 4-byte payload bit length (32 bits)
    if (width <= 0 || height < 120 || rgba.length < totalPixels * 4 || totalPixels < 152) {
        return null
    }

    let x = 0
    let y = 0
    const readBytes = (count: number): Uint8Array => {
        const out = new Uint8Array(count)
        for (let i = 0; i < count; i++) {
            let b = 0
            for (let bit = 0; bit < 8; bit++) {
                b = (b << 1) | (rgba[(y * width + x) * 4 + 3] & 1)
                if (++y === height) {
                    y = 0
                    x++
                }
            }
            out[i] = b
        }
        return out
    }

    if (latin1Decoder.decode(readBytes(15)) !== 'stealth_pngcomp') {
        return null
    }

    const lenBytes = readBytes(4)
    const bitLen =
        ((lenBytes[0] << 24) | (lenBytes[1] << 16) | (lenBytes[2] << 8) | lenBytes[3]) >>> 0
    if (bitLen === 0 || (bitLen & 7) !== 0 || 152 + bitLen > totalPixels) {
        return null
    }

    try {
        const parsed = JSON.parse(utf8Decoder.decode(fflate.gunzipSync(readBytes(bitLen >>> 3))))
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null
        }
        const chunks: Record<string, string> = {}
        for (const [k, v] of Object.entries(parsed)) {
            if (typeof v === 'string') {
                chunks[k] = v
            } else if (v !== null && v !== undefined) {
                chunks[k] = JSON.stringify(v)
            }
        }
        return Object.keys(chunks).length > 0 ? chunks : null
    } catch {
        return null
    }
}

type IfdEntry = {
    tag: number
    type: number // 2 = ASCII, 4 = LONG, 7 = UNDEFINED
    count: number
    data?: Uint8Array
    inlineValue?: number
}

function buildExifTiff(ifd0Entries: IfdEntry[], exifIfdEntries: IfdEntry[]): Uint8Array {
    const ifd0: IfdEntry[] = [...ifd0Entries]
    const hasExifIfd = exifIfdEntries.length > 0
    if (hasExifIfd) {
        ifd0.push({ tag: 0x8769, type: 4, count: 1, inlineValue: 0 })
    }
    ifd0.sort((a, b) => a.tag - b.tag)
    const exifIfd = [...exifIfdEntries].sort((a, b) => a.tag - b.tag)

    const ifd0Start = 8
    let cursor = ifd0Start + 2 + ifd0.length * 12 + 4

    const offsets = new Map<IfdEntry, number>()
    const assignOffsets = (entries: IfdEntry[]) => {
        for (const entry of entries) {
            if (entry.data && entry.data.length > 4) {
                offsets.set(entry, cursor)
                cursor += entry.data.length + (entry.data.length & 1)
            }
        }
    }

    assignOffsets(ifd0)
    const exifIfdStart = cursor
    if (hasExifIfd) {
        ifd0.find((e) => e.tag === 0x8769)!.inlineValue = exifIfdStart
        cursor += 2 + exifIfd.length * 12 + 4
        assignOffsets(exifIfd)
    }

    const out = new Uint8Array(cursor)
    const view = new DataView(out.buffer)
    out[0] = 0x49
    out[1] = 0x49
    view.setUint16(2, 0x002a, true)
    view.setUint32(4, ifd0Start, true)

    const writeIfd = (start: number, entries: IfdEntry[]) => {
        view.setUint16(start, entries.length, true)
        let pos = start + 2
        for (const entry of entries) {
            view.setUint16(pos, entry.tag, true)
            view.setUint16(pos + 2, entry.type, true)
            view.setUint32(pos + 4, entry.count, true)
            if (entry.data) {
                if (entry.data.length <= 4) {
                    out.set(entry.data, pos + 8)
                } else {
                    const dataOff = offsets.get(entry)!
                    view.setUint32(pos + 8, dataOff, true)
                    out.set(entry.data, dataOff)
                }
            } else {
                view.setUint32(pos + 8, entry.inlineValue ?? 0, true)
            }
            pos += 12
        }
        view.setUint32(pos, 0, true)
    }

    writeIfd(ifd0Start, ifd0)
    if (hasExifIfd) {
        writeIfd(exifIfdStart, exifIfd)
    }
    return out
}

function buildExifFromTextChunks(
    textChunks: Record<string, string>,
    includeWorkflow = true,
): Uint8Array | null {
    const ifd0: IfdEntry[] = []
    const exifIfd: IfdEntry[] = []

    // ComfyUI IFD0 layout (matches SaveAnimatedWEBP / getWebpMetadata):
    // 0x0110 (Model) = "prompt:<json>", 0x010f (Make) = "workflow:<json>"
    const pushIfd0Text = (tag: number, prefix: string, value: string) => {
        const bytes = concatBytes([textEncoder.encode(`${prefix}:${value}`), new Uint8Array([0])])
        ifd0.push({ tag, type: 2, count: bytes.length, data: bytes })
    }

    if (textChunks.prompt !== undefined) {
        pushIfd0Text(0x0110, 'prompt', textChunks.prompt)
    }
    let nextComfyTag = 0x010f
    if (includeWorkflow && textChunks.workflow !== undefined) {
        pushIfd0Text(nextComfyTag--, 'workflow', textChunks.workflow)
    }
    if (includeWorkflow && textChunks.workflow_api !== undefined) {
        pushIfd0Text(nextComfyTag, 'workflow_api', textChunks.workflow_api)
    }

    const otherChunks: Record<string, string> = {}
    for (const [k, v] of Object.entries(textChunks)) {
        if (!COMFY_KEYS.has(k)) otherChunks[k] = v
    }

    if (Object.keys(otherChunks).length > 0) {
        const hasNaiKeys =
            otherChunks.Comment !== undefined || otherChunks.Software === 'NovelAI'
        let userComment: Uint8Array
        if (otherChunks.parameters !== undefined && !hasNaiKeys) {
            const params = otherChunks.parameters
            userComment = isPureAscii(params)
                ? concatBytes([ASCII_COMMENT_PREFIX, encodeAsciiBytes(params)])
                : concatBytes([UNICODE_COMMENT_PREFIX, encodeUtf16BE(params)])
        } else {
            // NovelAI Inspect / NAIA convention: flat ASCII JSON object in UserComment
            userComment = concatBytes([
                ASCII_COMMENT_PREFIX,
                encodeAsciiBytes(jsonStringifyAscii(otherChunks)),
            ])
        }
        exifIfd.push({ tag: 0x9286, type: 7, count: userComment.length, data: userComment })
    }

    return ifd0.length > 0 || exifIfd.length > 0 ? buildExifTiff(ifd0, exifIfd) : null
}

function buildExifPayload(meta: ExtractedImageMetadata, maxBytes?: number): Uint8Array | null {
    if (Object.keys(meta.textChunks).length === 0) return null

    const full = buildExifFromTextChunks(meta.textChunks, true)
    if (full && (maxBytes === undefined || full.length <= maxBytes)) {
        return full
    }
    // If JPEG 64KB limit is exceeded by a large ComfyUI workflow, retry without workflow
    if (maxBytes !== undefined && meta.textChunks.workflow !== undefined) {
        const slim = buildExifFromTextChunks(meta.textChunks, false)
        if (slim && slim.length <= maxBytes) return slim
    }
    return null
}

function makeRiffChunk(fourcc: string, payload: Uint8Array): Uint8Array {
    const out = new Uint8Array(8 + payload.length + (payload.length & 1))
    writeFourCC(out, 0, fourcc)
    new DataView(out.buffer).setUint32(4, payload.length, true)
    out.set(payload, 8)
    return out
}

function injectExifIntoWebp(
    webpBytes: Uint8Array,
    exifTiff: Uint8Array,
    width: number,
    height: number,
): Uint8Array {
    if (
        webpBytes.length < 20 ||
        readFourCC(webpBytes, 0) !== 'RIFF' ||
        readFourCC(webpBytes, 8) !== 'WEBP' ||
        width <= 0 ||
        height <= 0
    ) {
        return webpBytes
    }

    const view = new DataView(webpBytes.buffer, webpBytes.byteOffset, webpBytes.byteLength)
    const chunks: { type: string; raw: Uint8Array }[] = []
    let pos = 12
    while (pos + 8 <= webpBytes.length) {
        const type = readFourCC(webpBytes, pos)
        const len = view.getUint32(pos + 4, true)
        const chunkEnd = pos + 8 + len + (len & 1)
        if (chunkEnd > webpBytes.length) return webpBytes
        chunks.push({ type, raw: webpBytes.subarray(pos, chunkEnd) })
        pos = chunkEnd
    }
    if (chunks.length === 0) return webpBytes

    const exifChunk = makeRiffChunk('EXIF', exifTiff)
    const outParts: Uint8Array[] = []

    if (chunks[0].type === 'VP8X') {
        const vp8x = chunks[0].raw.slice()
        if (vp8x.length < 18) return webpBytes
        vp8x[8] |= 0x08
        outParts.push(vp8x)
        for (let i = 1; i < chunks.length; i++) {
            if (chunks[i].type !== 'EXIF') outParts.push(chunks[i].raw)
        }
    } else {
        // Simple VP8 containers must be upgraded to VP8X to carry an EXIF chunk
        const vp8xPayload = new Uint8Array(10)
        vp8xPayload[0] = 0x08
        const wMinus1 = (width - 1) >>> 0
        const hMinus1 = (height - 1) >>> 0
        vp8xPayload[4] = wMinus1 & 0xff
        vp8xPayload[5] = (wMinus1 >>> 8) & 0xff
        vp8xPayload[6] = (wMinus1 >>> 16) & 0xff
        vp8xPayload[7] = hMinus1 & 0xff
        vp8xPayload[8] = (hMinus1 >>> 8) & 0xff
        vp8xPayload[9] = (hMinus1 >>> 16) & 0xff
        outParts.push(makeRiffChunk('VP8X', vp8xPayload))
        for (const chunk of chunks) {
            if (chunk.type !== 'EXIF') outParts.push(chunk.raw)
        }
    }
    outParts.push(exifChunk)

    let bodyLen = 4
    for (const part of outParts) bodyLen += part.length

    const header = new Uint8Array(12)
    writeFourCC(header, 0, 'RIFF')
    new DataView(header.buffer).setUint32(4, bodyLen, true)
    writeFourCC(header, 8, 'WEBP')
    return concatBytes([header, ...outParts])
}

function injectExifIntoJpeg(jpegBytes: Uint8Array, exifTiff: Uint8Array): Uint8Array {
    if (
        jpegBytes.length < 4 ||
        jpegBytes[0] !== 0xff ||
        jpegBytes[1] !== 0xd8 ||
        exifTiff.length > MAX_JPEG_EXIF_TIFF_BYTES
    ) {
        return jpegBytes
    }

    // Keep APP0 (JFIF) right after SOI when present
    let insertAt = 2
    if (jpegBytes.length >= 6 && jpegBytes[2] === 0xff && jpegBytes[3] === 0xe0) {
        const app0Len = (jpegBytes[4] << 8) | jpegBytes[5]
        if (app0Len >= 2 && 4 + app0Len <= jpegBytes.length) {
            insertAt = 4 + app0Len
        }
    }

    const segLen = 2 + EXIF_HEADER.length + exifTiff.length
    const app1 = new Uint8Array(2 + segLen)
    app1[0] = 0xff
    app1[1] = 0xe1
    app1[2] = (segLen >>> 8) & 0xff
    app1[3] = segLen & 0xff
    app1.set(EXIF_HEADER, 4)
    app1.set(exifTiff, 4 + EXIF_HEADER.length)
    return concatBytes([jpegBytes.subarray(0, insertAt), app1, jpegBytes.subarray(insertAt)])
}

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
    const out = new Uint8Array(12 + data.length)
    const view = new DataView(out.buffer)
    view.setUint32(0, data.length, false)
    writeFourCC(out, 4, type)
    out.set(data, 8)
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length) as Buffer) >>> 0, false)
    return out
}

function buildPngTextChunks(textChunks: Record<string, string>): RawPngChunk[] {
    const result: RawPngChunk[] = []
    for (const [key, value] of Object.entries(textChunks)) {
        if (!key || key.length > 79) continue
        const keyBytes = encodeAsciiBytes(key)
        if (isPureAscii(value)) {
            result.push({
                type: 'tEXt',
                data: concatBytes([keyBytes, new Uint8Array([0]), encodeAsciiBytes(value)]),
            })
        } else {
            // Uncompressed UTF-8 iTXt: key \0 compFlag(0) compMethod(0) lang \0 transKey \0 utf8
            result.push({
                type: 'iTXt',
                data: concatBytes([keyBytes, new Uint8Array([0, 0, 0, 0, 0]), textEncoder.encode(value)]),
            })
        }
    }
    return result
}

function injectMetadataIntoPng(pngBytes: Uint8Array, meta: ExtractedImageMetadata): Uint8Array {
    if (!hasPrefix(pngBytes, PNG_SIG)) return pngBytes

    const chunksToInject =
        meta.rawPngChunks.length > 0 ? meta.rawPngChunks : buildPngTextChunks(meta.textChunks)
    if (chunksToInject.length === 0) return pngBytes

    const view = new DataView(pngBytes.buffer, pngBytes.byteOffset, pngBytes.byteLength)
    let insertAt = -1
    let pos = 8
    while (pos + 12 <= pngBytes.length) {
        const len = view.getUint32(pos, false)
        const type = readFourCC(pngBytes, pos + 4)
        if (type === 'IDAT' || type === 'IEND') {
            insertAt = pos
            break
        }
        pos += 12 + len
    }
    if (insertAt === -1) return pngBytes

    const encodedChunks = chunksToInject.map((c) => makePngChunk(c.type, c.data))
    return concatBytes([pngBytes.subarray(0, insertAt), ...encodedChunks, pngBytes.subarray(insertAt)])
}

export function injectMetadataIntoImage(
    imageBytes: Uint8Array,
    format: InlayImageFormat,
    meta: ExtractedImageMetadata,
    width: number,
    height: number,
): Uint8Array {
    if (!hasMetadata(meta)) return imageBytes
    if (format === 'png') {
        return injectMetadataIntoPng(imageBytes, meta)
    }
    if (format === 'webp') {
        const exif = buildExifPayload(meta)
        return exif ? injectExifIntoWebp(imageBytes, exif, width, height) : imageBytes
    }
    const exif = buildExifPayload(meta, MAX_JPEG_EXIF_TIFF_BYTES)
    return exif ? injectExifIntoJpeg(imageBytes, exif) : imageBytes
}
