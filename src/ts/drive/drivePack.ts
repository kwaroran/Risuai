/**
 * Google Drive backup v2 pack format.
 *
 * A backup is one logical stream of entries split into numbered pack files.
 * Packs are cut at entry boundaries when possible, and an entry larger than the
 * pack limit is cut at the limit and continued in the next pack, so every pack
 * can be parsed on its own and an interrupted backup can resume from the last
 * complete pack.
 *
 * Pack layout (little endian):
 *   header:   "RISUPACK" | version u8 | seq u32
 *   START:    0x01 | nameLength u32 | name | totalSize u64
 *   DATA:     0x02 | length u32 | bytes
 *   END:      0x03
 *   CONTINUE: 0x04 | nameLength u32 | name | totalSize u64 | offset u64
 */

export const DRIVE_PACK_LIMIT = 50 * 1024 * 1024
export const DRIVE_V2_VERSION = 2

const MAGIC = new TextEncoder().encode('RISUPACK')
const HEADER_SIZE = MAGIC.length + 1 + 4

const RECORD_START = 0x01
const RECORD_DATA = 0x02
const RECORD_END = 0x03
const RECORD_CONTINUE = 0x04

//type + length
const DATA_OVERHEAD = 1 + 4
const END_SIZE = 1

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type PackPosition = {
    entry: number
    offset: number
}

export type PackSegment = {
    seq: number
    bytes: Uint8Array
    //position of the first byte in this pack
    start: PackPosition
    //position right after the last byte in this pack
    end: PackPosition
    //indices of the entries that have bytes inside this pack
    entries: number[]
}

export type PackPiece = {
    name: string
    size: number
    offset: number
    data: Uint8Array
    complete: boolean
}

export type DrivePackRef = {
    //backup id that owns the packs
    b: string
    //first and last pack sequence holding the entry
    s: number
    e: number
} | {
    //legacy v1 file name
    l: string
}

export type DriveV2Manifest = {
    version: 2
    id: string
    createdAt: number
    database: string
    entries: Record<string, DrivePackRef>
    //pack file name -> byte length
    packs: Record<string, number>
}

export type DriveV2Plan = {
    version: 2
    id: string
    limit: number
    entries: string[]
    skipped: number[]
}

export type DriveV2FileInfo = {
    id: string
    kind: 'pack' | 'plan' | 'manifest' | 'database'
    seq?: number
}

const v2FileRegex = /^risu-v2-(\d+)-(?:(\d{8})\.risupack|(plan)\.json|(manifest)\.json|(database)\.risudat)$/

export function packFileName(id: string, seq: number) {
    return `risu-v2-${id}-${String(seq).padStart(8, '0')}.risupack`
}

export function planFileName(id: string) {
    return `risu-v2-${id}-plan.json`
}

export function manifestFileName(id: string) {
    return `risu-v2-${id}-manifest.json`
}

export function databaseFileName(id: string) {
    return `risu-v2-${id}-database.risudat`
}

export function parseV2FileName(name: string): DriveV2FileInfo | null {
    const match = v2FileRegex.exec(name)
    if(!match){
        return null
    }
    if(match[2]){
        return { id: match[1], kind: 'pack', seq: parseInt(match[2]) }
    }
    return { id: match[1], kind: match[3] ? 'plan' : match[4] ? 'manifest' : 'database' }
}

export function assetEntryName(name: string) {
    return 'a:' + name
}

export function coldEntryName(backupName: string) {
    return 'c:' + backupName
}

/**
 * Returns the inclusive range of entry indices that have bytes inside a pack
 * spanning from start to end, or null when the pack holds no entry bytes.
 */
export function coveredEntries(start: PackPosition, end: PackPosition): [number, number] | null {
    const last = end.offset > 0 ? end.entry : end.entry - 1
    if(last < start.entry){
        return null
    }
    return [start.entry, last]
}

function u32(value: number) {
    const bytes = new Uint8Array(4)
    new DataView(bytes.buffer).setUint32(0, value, true)
    return bytes
}

function u64(value: number) {
    const bytes = new Uint8Array(8)
    new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true)
    return bytes
}

function concatBytes(parts: Uint8Array[]) {
    let length = 0
    for(const part of parts){
        length += part.byteLength
    }
    const result = new Uint8Array(length)
    let offset = 0
    for(const part of parts){
        result.set(part, offset)
        offset += part.byteLength
    }
    return result
}

function startRecordSize(nameBytes: Uint8Array) {
    return 1 + 4 + nameBytes.byteLength + 8
}

function continueRecordSize(nameBytes: Uint8Array) {
    return 1 + 4 + nameBytes.byteLength + 8 + 8
}

/**
 * Splits entries into packs of at most `limit` bytes.
 * Each completed pack is passed to `onSegment` before the next one is built,
 * so only one pack is held in memory at a time.
 */
export class DrivePackSegmenter {
    private parts: Uint8Array[] = []
    private length = 0
    private isOpen = false
    private seq: number
    private start: PackPosition = { entry: 0, offset: 0 }
    private position: PackPosition = { entry: 0, offset: 0 }
    private entries: number[] = []

    constructor(
        private readonly limit: number,
        startSeq: number,
        private readonly onSegment: (segment: PackSegment) => Promise<void> | void
    ) {
        this.seq = startSeq
    }

    /**
     * Adds an entry. `from` is the byte offset to start from, used when resuming
     * an entry that was partially written to an earlier pack.
     */
    async addEntry(index: number, name: string, data: Uint8Array, from = 0) {
        const nameBytes = encoder.encode(name)
        const size = data.byteLength

        if(from === 0){
            const fixed = startRecordSize(nameBytes)
            const whole = fixed + (size > 0 ? DATA_OVERHEAD + size : 0) + END_SIZE
            //smallest prefix that still makes progress
            const minimum = fixed + (size > 0 ? DATA_OVERHEAD + 1 : 0) + END_SIZE
            if(this.isOpen && this.length + whole > this.limit){
                //cut at the entry boundary unless the entry is too large for any pack anyway
                if(whole <= this.limit - HEADER_SIZE || this.length + minimum > this.limit){
                    await this.close()
                }
            }
            this.open({ entry: index, offset: 0 })
            if(this.length + minimum > this.limit){
                throw new Error(`Pack limit is too small for entry ${name}`)
            }
            this.push(new Uint8Array([RECORD_START]), u32(nameBytes.byteLength), nameBytes, u64(size))
        }
        else{
            await this.close()
            this.pushContinue(index, nameBytes, size, from)
        }
        this.markEntry(index)

        let offset = from
        while(offset < size){
            const room = this.limit - this.length - DATA_OVERHEAD - END_SIZE
            if(room <= 0){
                await this.close()
                this.pushContinue(index, nameBytes, size, offset)
                this.markEntry(index)
                continue
            }
            const take = Math.min(size - offset, room)
            this.push(new Uint8Array([RECORD_DATA]), u32(take), data.subarray(offset, offset + take))
            offset += take
            this.position = { entry: index, offset }
            if(offset < size){
                await this.close()
                this.pushContinue(index, nameBytes, size, offset)
                this.markEntry(index)
            }
        }

        this.push(new Uint8Array([RECORD_END]))
        this.position = { entry: index + 1, offset: 0 }
    }

    async finish() {
        await this.close()
    }

    private pushContinue(index: number, nameBytes: Uint8Array, size: number, offset: number) {
        this.open({ entry: index, offset })
        if(this.length + continueRecordSize(nameBytes) + DATA_OVERHEAD + 1 + END_SIZE > this.limit){
            throw new Error('Pack limit is too small to continue an entry')
        }
        this.push(
            new Uint8Array([RECORD_CONTINUE]),
            u32(nameBytes.byteLength),
            nameBytes,
            u64(size),
            u64(offset)
        )
    }

    private open(start: PackPosition) {
        if(this.isOpen){
            return
        }
        const header = new Uint8Array(HEADER_SIZE)
        header.set(MAGIC, 0)
        header[MAGIC.length] = DRIVE_V2_VERSION
        new DataView(header.buffer).setUint32(MAGIC.length + 1, this.seq, true)
        this.parts = [header]
        this.length = HEADER_SIZE
        this.start = start
        this.position = start
        this.entries = []
        this.isOpen = true
    }

    private push(...parts: Uint8Array[]) {
        for(const part of parts){
            this.parts.push(part)
            this.length += part.byteLength
        }
    }

    private markEntry(index: number) {
        if(this.entries[this.entries.length - 1] !== index){
            this.entries.push(index)
        }
    }

    private async close() {
        if(!this.isOpen){
            return
        }
        const segment: PackSegment = {
            seq: this.seq,
            bytes: concatBytes(this.parts),
            start: this.start,
            end: this.position,
            entries: this.entries,
        }
        this.parts = []
        this.length = 0
        this.isOpen = false
        this.seq += 1
        await this.onSegment(segment)
    }
}

/**
 * Parses a pack into the pieces of the entries it holds.
 * Throws when the pack is truncated or malformed.
 */
export function parsePack(bytes: Uint8Array): { seq: number, pieces: PackPiece[] } {
    if(bytes.byteLength < HEADER_SIZE){
        throw new Error('Pack is too short')
    }
    for(let i = 0; i < MAGIC.length; i++){
        if(bytes[i] !== MAGIC[i]){
            throw new Error('Invalid pack header')
        }
    }
    if(bytes[MAGIC.length] !== DRIVE_V2_VERSION){
        throw new Error(`Unsupported pack version: ${bytes[MAGIC.length]}`)
    }

    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const seq = view.getUint32(MAGIC.length + 1, true)
    const pieces: PackPiece[] = []
    let offset = HEADER_SIZE
    let current: { name: string, size: number, offset: number, chunks: Uint8Array[] } | null = null

    const need = (length: number) => {
        if(offset + length > bytes.byteLength){
            throw new Error('Pack ended in the middle of a record')
        }
    }
    const readU32 = () => {
        need(4)
        const value = view.getUint32(offset, true)
        offset += 4
        return value
    }
    const readU64 = () => {
        need(8)
        const value = Number(view.getBigUint64(offset, true))
        offset += 8
        return value
    }
    const readName = () => {
        const length = readU32()
        need(length)
        const name = decoder.decode(bytes.subarray(offset, offset + length))
        offset += length
        return name
    }
    const finishCurrent = (complete: boolean) => {
        if(!current){
            return
        }
        pieces.push({
            name: current.name,
            size: current.size,
            offset: current.offset,
            data: current.chunks.length === 1 ? current.chunks[0] : concatBytes(current.chunks),
            complete,
        })
        current = null
    }

    while(offset < bytes.byteLength){
        const type = bytes[offset]
        offset += 1
        switch(type){
            case RECORD_START: {
                finishCurrent(false)
                const name = readName()
                current = { name, size: readU64(), offset: 0, chunks: [] }
                break
            }
            case RECORD_CONTINUE: {
                finishCurrent(false)
                const name = readName()
                const size = readU64()
                current = { name, size, offset: readU64(), chunks: [] }
                break
            }
            case RECORD_DATA: {
                if(!current){
                    throw new Error('Pack data record without an entry')
                }
                const length = readU32()
                need(length)
                current.chunks.push(bytes.subarray(offset, offset + length))
                offset += length
                break
            }
            case RECORD_END: {
                if(!current){
                    throw new Error('Pack end record without an entry')
                }
                finishCurrent(true)
                break
            }
            default:
                throw new Error(`Unknown pack record type: ${type}`)
        }
    }
    finishCurrent(false)

    return { seq, pieces }
}

/**
 * Joins the pieces of one entry, fed in pack order, into a fresh buffer.
 * Each piece is copied as it is added, so the pack it came from can be
 * released before the next pack is read.
 */
export class EntryAssembler {
    private buffer: Uint8Array | null = null
    private size = 0
    private filled = 0
    private result: Uint8Array | null = null

    add(piece: PackPiece) {
        if(this.result){
            return
        }
        if(piece.offset === 0){
            this.size = piece.size
            this.buffer = new Uint8Array(this.size)
            this.filled = 0
        }
        else if(!this.buffer || piece.offset !== this.filled || piece.size !== this.size){
            this.buffer = null
            return
        }
        if(this.filled + piece.data.byteLength > this.size){
            this.buffer = null
            return
        }
        this.buffer.set(piece.data, this.filled)
        this.filled += piece.data.byteLength
        if(piece.complete){
            this.result = this.filled === this.size ? this.buffer : null
            this.buffer = null
        }
    }

    /** The complete entry, or null when the pieces did not form one. */
    get value() {
        return this.result
    }
}

/**
 * Joins the pieces of one entry, given in pack order, into a fresh buffer.
 * Returns null when the pieces do not form a complete entry.
 */
export function assembleEntry(pieces: PackPiece[]): Uint8Array | null {
    const assembler = new EntryAssembler()
    for(const piece of pieces){
        assembler.add(piece)
        if(assembler.value){
            break
        }
    }
    return assembler.value
}
