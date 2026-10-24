import { describe, expect, it } from 'vitest'
import {
    assembleEntry,
    coveredEntries,
    DrivePackSegmenter,
    packFileName,
    parsePack,
    parseV2FileName,
    type PackPiece,
    type PackSegment,
} from './drivePack'

function makeData(size: number, seed: number) {
    const data = new Uint8Array(size)
    for(let i = 0; i < size; i++){
        data[i] = (i * 31 + seed) & 0xff
    }
    return data
}

async function segmentAll(limit: number, entries: [string, Uint8Array][], startSeq = 1) {
    const segments: PackSegment[] = []
    const segmenter = new DrivePackSegmenter(limit, startSeq, (segment) => {
        segments.push(segment)
    })
    for(let i = 0; i < entries.length; i++){
        await segmenter.addEntry(i, entries[i][0], entries[i][1])
    }
    await segmenter.finish()
    return segments
}

function readEntries(segments: PackSegment[]) {
    const pieces = new Map<string, PackPiece[]>()
    for(const segment of segments){
        const parsed = parsePack(segment.bytes)
        expect(parsed.seq).toBe(segment.seq)
        for(const piece of parsed.pieces){
            const list = pieces.get(piece.name) ?? []
            list.push(piece)
            pieces.set(piece.name, list)
        }
    }
    const result = new Map<string, Uint8Array | null>()
    for(const [name, list] of pieces){
        result.set(name, assembleEntry(list))
    }
    return result
}

describe('drivePack', () => {
    it('packs small entries into one pack and reads them back', async () => {
        const entries: [string, Uint8Array][] = [
            ['a:one.png', makeData(10, 1)],
            ['a:empty.png', new Uint8Array()],
            ['c:coldstorage_x.json', makeData(200, 2)],
        ]
        const segments = await segmentAll(4096, entries)

        expect(segments).toHaveLength(1)
        expect(segments[0].seq).toBe(1)
        expect(segments[0].start).toEqual({ entry: 0, offset: 0 })
        expect(segments[0].end).toEqual({ entry: 3, offset: 0 })
        const restored = readEntries(segments)
        for(const [name, data] of entries){
            expect(restored.get(name)).toEqual(data)
        }
    })

    it('cuts packs at entry boundaries when an entry fits in an empty pack', async () => {
        const limit = 1000
        const entries: [string, Uint8Array][] = []
        for(let i = 0; i < 12; i++){
            entries.push([`a:file${i}.png`, makeData(150 + i * 20, i)])
        }
        const segments = await segmentAll(limit, entries)

        expect(segments.length).toBeGreaterThan(1)
        for(const segment of segments){
            expect(segment.bytes.byteLength).toBeLessThanOrEqual(limit)
            const pieces = parsePack(segment.bytes).pieces
            for(const piece of pieces){
                expect(piece.offset).toBe(0)
                expect(piece.complete).toBe(true)
            }
        }
        const restored = readEntries(segments)
        for(const [name, data] of entries){
            expect(restored.get(name)).toEqual(data)
        }
    })

    it('splits an entry larger than the limit across packs', async () => {
        const limit = 1000
        const big = makeData(4321, 7)
        const entries: [string, Uint8Array][] = [
            ['a:small.png', makeData(300, 1)],
            ['a:big.mp4', big],
            ['a:after.png', makeData(50, 3)],
        ]
        const segments = await segmentAll(limit, entries)

        expect(segments.length).toBeGreaterThanOrEqual(5)
        for(const segment of segments){
            expect(segment.bytes.byteLength).toBeLessThanOrEqual(limit)
        }
        expect(segments.map((segment) => segment.seq)).toEqual(segments.map((_, i) => i + 1))
        const restored = readEntries(segments)
        for(const [name, data] of entries){
            expect(restored.get(name)).toEqual(data)
        }
    })

    it('resumes from the end of the last complete pack', async () => {
        const limit = 800
        const entries: [string, Uint8Array][] = [
            ['a:one.png', makeData(500, 1)],
            ['a:two.bin', makeData(2500, 2)],
            ['a:three.png', makeData(100, 3)],
            ['c:coldstorage_y.json', makeData(700, 4)],
        ]
        const full = await segmentAll(limit, entries)

        for(let kept = 1; kept < full.length; kept++){
            const done = full.slice(0, kept)
            const resumeAt = done[done.length - 1].end
            const resumed: PackSegment[] = []
            const segmenter = new DrivePackSegmenter(limit, kept + 1, (segment) => {
                resumed.push(segment)
            })
            for(let i = resumeAt.entry; i < entries.length; i++){
                await segmenter.addEntry(i, entries[i][0], entries[i][1], i === resumeAt.entry ? resumeAt.offset : 0)
            }
            await segmenter.finish()

            const restored = readEntries([...done, ...resumed])
            for(const [name, data] of entries){
                expect(restored.get(name)).toEqual(data)
            }
        }
    })

    it('reports the entries each pack covers', async () => {
        const segments = await segmentAll(1000, [
            ['a:one.png', makeData(600, 1)],
            ['a:two.png', makeData(2000, 2)],
        ])

        for(const segment of segments){
            const range = coveredEntries(segment.start, segment.end)
            expect(range).not.toBeNull()
            const indices: number[] = []
            for(let i = range![0]; i <= range![1]; i++){
                indices.push(i)
            }
            expect(indices).toEqual(segment.entries)
        }
        expect(coveredEntries({ entry: 3, offset: 0 }, { entry: 3, offset: 0 })).toBeNull()
    })

    it('rejects a truncated pack', async () => {
        const [segment] = await segmentAll(4096, [['a:one.png', makeData(100, 1)]])

        expect(() => parsePack(segment.bytes.subarray(0, segment.bytes.byteLength - 20))).toThrow()
        expect(() => parsePack(new TextEncoder().encode('not a pack at all'))).toThrow()
    })

    it('returns null for incomplete entries', async () => {
        const segments = await segmentAll(1000, [['a:big.bin', makeData(3000, 1)]])
        const pieces = segments.slice(0, -1).flatMap((segment) => parsePack(segment.bytes).pieces)

        expect(assembleEntry(pieces)).toBeNull()
    })

    it('names and parses v2 files', () => {
        expect(packFileName('1700000000000', 1)).toBe('risu-v2-1700000000000-00000001.risupack')
        expect(parseV2FileName('risu-v2-1700000000000-00000012.risupack')).toEqual({ id: '1700000000000', kind: 'pack', seq: 12 })
        expect(parseV2FileName('risu-v2-1700000000000-plan.json')).toEqual({ id: '1700000000000', kind: 'plan' })
        expect(parseV2FileName('risu-v2-1700000000000-manifest.json')).toEqual({ id: '1700000000000', kind: 'manifest' })
        expect(parseV2FileName('risu-v2-1700000000000-database.risudat')).toEqual({ id: '1700000000000', kind: 'database' })
        expect(parseV2FileName('1700000000-database.risudat')).toBeNull()
        expect(parseV2FileName('abc.png.bin')).toBeNull()
    })
})
