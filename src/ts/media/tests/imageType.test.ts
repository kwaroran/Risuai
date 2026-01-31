import { expect, test } from 'vitest'
import { getImageType } from '../imageType'

test('should detect JPEG', () => {
  // JPEG starts with FF D8, ends with FF D9
  const jpeg = new Uint8Array([0xff, 0xd8, 0x00, 0x00, 0xff, 0xd9])
  expect(getImageType(jpeg)).toBe('JPEG')
})

test('should detect PNG', () => {
  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  expect(getImageType(png)).toBe('PNG')
})

test('should detect GIF87a', () => {
  // GIF87a: 47 49 46 38 37 61
  const gif87a = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x37, 0x61])
  expect(getImageType(gif87a)).toBe('GIF')
})

test('should detect GIF89a', () => {
  // GIF89a: 47 49 46 38 39 61
  const gif89a = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61])
  expect(getImageType(gif89a)).toBe('GIF')
})

test('should detect BMP', () => {
  // BMP starts with 42 4D ("BM")
  const bmp = new Uint8Array([0x42, 0x4d, 0x00, 0x00])
  expect(getImageType(bmp)).toBe('BMP')
})

test('should detect AVIF', () => {
  // AVIF: bytes 4-11 are "ftypavif"
  const avif = new Uint8Array([
    0x00,
    0x00,
    0x00,
    0x00, // size (bytes 0-3)
    0x66,
    0x74,
    0x79,
    0x70, // "ftyp" (bytes 4-7)
    0x61,
    0x76,
    0x69,
    0x66, // "avif" (bytes 8-11)
  ])
  expect(getImageType(avif)).toBe('AVIF')
})

test('should detect WEBP', () => {
  // WEBP: "RIFF" at 0-3, "WEBP" at 8-11
  const webp = new Uint8Array([
    0x52,
    0x49,
    0x46,
    0x46, // "RIFF" (bytes 0-3)
    0x00,
    0x00,
    0x00,
    0x00, // file size (bytes 4-7)
    0x57,
    0x45,
    0x42,
    0x50, // "WEBP" (bytes 8-11)
  ])
  expect(getImageType(webp)).toBe('WEBP')
})

test('should return Unknown for unrecognized format', () => {
  const unknown = new Uint8Array([0x00, 0x01, 0x02, 0x03])
  expect(getImageType(unknown)).toBe('Unknown')
})

test('should return Unknown for empty array', () => {
  const empty = new Uint8Array([])
  expect(getImageType(empty)).toBe('Unknown')
})
