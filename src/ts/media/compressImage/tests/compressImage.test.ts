import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DBState } from '../../../stores.svelte'
import { compressImage } from '../compressImage'

vi.mock(
    import('../../../stores.svelte'),
    () =>
        ({
            DBState: {
                db: {
                    imageCompression: false,
                },
            },
        }) as typeof import('../../../stores.svelte'),
)

const doLossyCompressionMock = vi.fn()
vi.mock(import('../lossyCompression'), () => ({
    doLossyCompression: (...args: any[]) => doLossyCompressionMock(...args),
}))

beforeEach(() => {
    vi.clearAllMocks()
})

describe('imageCompression disabled', () => {
    beforeEach(() => {
        DBState.db.imageCompression = false
    })

    test('returns original data without compression', async () => {
        const originalData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) // PNG
        const result = await compressImage(originalData)
        expect(result).toBe(originalData)
    })
})

describe('imageCompression enabled', () => {
    beforeEach(() => {
        DBState.db.imageCompression = true
    })

    test('returns original data for Unknown type', async () => {
        const unknownData = new Uint8Array([0x00, 0x01, 0x02, 0x03])
        const result = await compressImage(unknownData)
        expect(result).toBe(unknownData)
    })

    test('returns original data for WEBP', async () => {
        const webpData = new Uint8Array([
            0x52,
            0x49,
            0x46,
            0x46, // "RIFF"
            0x00,
            0x00,
            0x00,
            0x00, // file size
            0x57,
            0x45,
            0x42,
            0x50, // "WEBP"
        ])
        const result = await compressImage(webpData)
        expect(result).toBe(webpData)
    })

    test('returns original data for AVIF', async () => {
        const avifData = new Uint8Array([
            0x00,
            0x00,
            0x00,
            0x00, // size
            0x66,
            0x74,
            0x79,
            0x70, // "ftyp"
            0x61,
            0x76,
            0x69,
            0x66, // "avif"
        ])
        const result = await compressImage(avifData)
        expect(result).toBe(avifData)
    })

    test('calls doLossyCompression for PNG', async () => {
        const mockCompressed = Buffer.from([0x01, 0x02, 0x03])
        doLossyCompressionMock.mockResolvedValue(mockCompressed)

        const pngData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        const result = await compressImage(pngData)

        expect(doLossyCompressionMock).toHaveBeenCalledWith(pngData)
        expect(result).toBe(mockCompressed)
    })

    test('calls doLossyCompression for JPEG', async () => {
        const mockCompressed = Buffer.from([0x01, 0x02, 0x03])
        doLossyCompressionMock.mockResolvedValue(mockCompressed)

        const jpegData = new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0xff, 0xd9])
        const result = await compressImage(jpegData)

        expect(doLossyCompressionMock).toHaveBeenCalledWith(jpegData)
        expect(result).toBe(mockCompressed)
    })

    test('calls doLossyCompression for GIF', async () => {
        const mockCompressed = Buffer.from([0x01, 0x02, 0x03])
        doLossyCompressionMock.mockResolvedValue(mockCompressed)

        const gifData = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
        const result = await compressImage(gifData)

        expect(doLossyCompressionMock).toHaveBeenCalledWith(gifData)
        expect(result).toBe(mockCompressed)
    })

    test('calls doLossyCompression for BMP', async () => {
        const mockCompressed = Buffer.from([0x01, 0x02, 0x03])
        doLossyCompressionMock.mockResolvedValue(mockCompressed)

        const bmpData = new Uint8Array([0x42, 0x4d, 0x00, 0x00])
        const result = await compressImage(bmpData)

        expect(doLossyCompressionMock).toHaveBeenCalledWith(bmpData)
        expect(result).toBe(mockCompressed)
    })
})
