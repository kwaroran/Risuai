import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    return {
        platform: { isTauri: false, isNodeServer: false },
        dbSettings: { enableRemoteSaving: false } as Record<string, any>,
        /** risuSaveCache localforage instance */
        cache: new Map<string, any>(),
        /** forageStorage (remote block files on web/node) */
        forage: new Map<string, any>(),
    }
})

vi.mock('@tauri-apps/plugin-fs', () => ({
    writeFile: vi.fn(),
    exists: vi.fn(async () => false),
    mkdir: vi.fn(),
    readFile: vi.fn(),
    BaseDirectory: { AppData: 0 },
}))

vi.mock('localforage', () => ({
    default: {
        createInstance: () => ({
            getItem: async (key: string) => mocks.cache.get(key) ?? null,
            setItem: async (key: string, value: any) => {
                mocks.cache.set(key, value)
                return value
            },
        }),
    },
}))

vi.mock('../globalApi.svelte', () => ({
    forageStorage: {
        getItem: async (key: string) => mocks.forage.get(key) ?? null,
        setItem: async (key: string, value: any) => {
            mocks.forage.set(key, value)
        },
        keys: async () => [...mocks.forage.keys()],
    },
}))

vi.mock('./database.svelte', () => ({
    getDatabase: () => mocks.dbSettings,
    presetTemplate: { name: 'template preset' },
}))

vi.mock('src/ts/platform', () => ({
    get isTauri() {
        return mocks.platform.isTauri
    },
    get isNodeServer() {
        return mocks.platform.isNodeServer
    },
}))

import { RisuSaveDecoder, RisuSaveEncoder, decodeRisuSave, encodeRisuSave, type toSaveType } from './risuSave'

const TYPE = {
    ROOT: 1,
    CHARACTER_WITH_CHAT: 2,
    CHAT: 3,
    REMOTE: 6,
    CHARACTER_WITHOUT_CHAT: 7,
}

const header = new TextEncoder().encode('RISUSAVE\0')

type ParsedBlock = {
    type: number
    name: string
    compressed: boolean
    /** the whole encoded block, for byte comparisons */
    raw: Uint8Array
    content: string
}

function parseBlocks(file: ArrayBuffer | Uint8Array): ParsedBlock[] {
    const data = new Uint8Array(file)
    const blocks: ParsedBlock[] = []
    let offset = header.length
    while (offset < data.length) {
        const start = offset
        const type = data[offset]
        const compressed = data[offset + 1] === 1
        const nameLength = data[offset + 2]
        offset += 3
        const name = new TextDecoder().decode(data.subarray(offset, offset + nameLength))
        offset += nameLength
        const length = new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(0, true)
        offset += 4
        const content = new TextDecoder().decode(data.subarray(offset, offset + length))
        offset += length
        blocks.push({ type, name, compressed, raw: data.slice(start, offset), content })
    }
    return blocks
}

function assembleBlocks(blocks: Uint8Array[]) {
    const total = header.length + blocks.reduce((a, b) => a + b.length, 0)
    const out = new Uint8Array(total)
    out.set(header, 0)
    let offset = header.length
    for (const block of blocks) {
        out.set(block, offset)
        offset += block.length
    }
    return out
}

function blockMap(file: ArrayBuffer | Uint8Array) {
    return new Map(parseBlocks(file).map((b) => [b.name, b]))
}

function makeMessages(count: number, prefix = 'msg') {
    const messages = []
    for (let i = 0; i < count; i++) {
        messages.push({
            role: i % 2 === 0 ? 'user' : 'char',
            data: `${prefix} ${i} ` + 'lorem ipsum '.repeat(5),
            time: 1700000000000 + i,
            chatId: `${prefix}-${i}`,
        })
    }
    return messages
}

function makeChat(id: string | undefined, name: string, messages: any[]) {
    const chat: any = {
        message: messages,
        note: `note of ${name}`,
        name,
        localLore: [],
        fmIndex: -1,
        scriptstate: { counter: 1, flag: true },
    }
    if (id !== undefined) {
        chat.id = id
    }
    return chat
}

function makeCharacter(chaId: string, chats: any[], extra: Record<string, any> = {}) {
    return {
        type: 'character',
        chaId,
        name: `Character ${chaId}`,
        firstMessage: 'Hello',
        desc: 'description',
        chats,
        chatPage: 0,
        customscript: [],
        globalLore: [],
        emotionImages: [],
        ...extra,
    }
}

function makeDatabase(): any {
    return {
        username: 'tester',
        mainPrompt: 'main prompt',
        formatversion: 5,
        characterOrder: ['cha-a', 'cha-b', 'group-1', 'cha-empty'],
        botPresets: [{ name: 'preset 1', mainPrompt: 'x' }],
        botPresetsId: 0,
        modules: [{ id: 'mod-1', name: 'module', lorebook: [] }],
        loadouts: [],
        plugins: [],
        pluginCustomStorage: { someKey: 'value' },
        characters: [
            makeCharacter('cha-a', [
                makeChat('chat-a1', 'First', makeMessages(10, 'a1')),
                makeChat('chat-a2', '두번째 채팅 🎉', [
                    { role: 'user', data: '안녕하세요 👋 émoji 🧪 \u0000 nul and "quotes" \\ backslash', time: 1 },
                    { role: 'char', data: '你好 🐉 😀 \n newline', time: 2 },
                ]),
                makeChat('chat-a3', 'Third', makeMessages(3, 'a3')),
            ], { chatPage: 1 }),
            makeCharacter('cha-b', [
                makeChat('chat-b1', 'Large', makeMessages(2000, 'b1')),
                makeChat('chat-b2', 'Small', makeMessages(1, 'b2')),
            ]),
            {
                type: 'group',
                chaId: 'group-1',
                name: 'Group',
                firstMessage: '',
                characters: ['cha-a', 'cha-b'],
                characterTalks: [0.6, 0.6],
                characterActive: [true, true],
                chats: [
                    makeChat('chat-g1', 'Group chat', makeMessages(5, 'g1')),
                    makeChat('chat-g2', 'Group chat 2', []),
                ],
                chatPage: 1,
                customscript: [],
                globalLore: [],
                emotionImages: [],
            },
            makeCharacter('cha-empty', []),
        ],
    }
}

function emptyToSave(extra: Partial<toSaveType> = {}): toSaveType {
    return {
        character: [],
        chat: [],
        allChats: [],
        botPreset: false,
        modules: false,
        loadouts: false,
        plugins: false,
        pluginCustomStorage: false,
        ...extra,
    }
}

function clone<T>(v: T): T {
    return JSON.parse(JSON.stringify(v))
}

async function makeSplitEncoder(db: any, options: { cache?: boolean, remote?: boolean } = {}) {
    const encoder = new RisuSaveEncoder({ splitChats: true, remote: options.remote ?? false, cache: options.cache ?? false })
    await encoder.init(db)
    await encoder.set(db, emptyToSave())
    return encoder
}

async function decode(file: ArrayBuffer | Uint8Array) {
    return (await new RisuSaveDecoder().decode(new Uint8Array(file))).database as any
}

function chatBlocksOf(file: ArrayBuffer | Uint8Array, chaId: string) {
    return parseBlocks(file).filter((b) => b.type === TYPE.CHAT && JSON.parse(b.content).chaId === chaId)
}

function expectNoStaleBlocks(file: ArrayBuffer | Uint8Array, db: any) {
    const blocks = parseBlocks(file)
    const names = blocks.map((b) => b.name)
    expect(new Set(names).size).toBe(names.length)
    const root = JSON.parse(blocks.find((b) => b.type === TYPE.ROOT).content)
    expect([...root.__directory].sort()).toEqual(names.filter((n) => n !== 'root').sort())
    for (const block of blocks.filter((b) => b.type === TYPE.CHAT)) {
        const payload = JSON.parse(block.content)
        const character = db.characters.find((c: any) => c.chaId === payload.chaId)
        expect(character, `chat block ${block.name} has no character`).toBeTruthy()
        const owner = blocks.find((b) => b.name === payload.chaId)
        expect(owner.type, `chat block ${block.name} belongs to a legacy character`).toBe(TYPE.CHARACTER_WITHOUT_CHAT)
        expect(character.chats.some((c: any) => c.id === payload.chatId), `stale chat block ${block.name}`).toBe(true)
    }
}

beforeEach(() => {
    mocks.platform.isTauri = false
    mocks.platform.isNodeServer = false
    mocks.dbSettings = { enableRemoteSaving: false }
    mocks.cache.clear()
    mocks.forage.clear()
    vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('split chat saving: round trip', () => {
    it('decodes a split save to the original database', async () => {
        const db = makeDatabase()
        const before = clone(db)
        const encoder = await makeSplitEncoder(db)
        const file = encoder.encode()

        expect(db).toEqual(before) //encoder never mutates the database

        const blocks = parseBlocks(file)
        const types = new Map(blocks.map((b) => [b.name, b.type]))
        for (const character of db.characters) {
            expect(types.get(character.chaId)).toBe(TYPE.CHARACTER_WITHOUT_CHAT)
            expect(chatBlocksOf(file, character.chaId).map((b) => JSON.parse(b.content).chatId))
                .toEqual(character.chats.map((c: any) => c.id))
        }
        expect(blocks.filter((b) => b.type === TYPE.CHAT)).toHaveLength(7)
        expect(blocks.some((b) => b.type === TYPE.CHARACTER_WITH_CHAT)).toBe(false)
        expectNoStaleBlocks(file, db)

        const decoded = await decode(file)
        expect(decoded).toEqual(db)
        expect(decoded.characters.map((c: any) => c.chaId)).toEqual(['cha-a', 'cha-b', 'group-1', 'cha-empty'])
        expect(JSON.stringify(decoded)).not.toContain('__risuSplitChats')
        for (const character of decoded.characters) {
            expect(Array.isArray(character.chats)).toBe(true)
            for (const chat of character.chats) {
                expect(Object.keys(chat).sort()).toEqual(
                    Object.keys(db.characters.find((c: any) => c.chaId === character.chaId).chats.find((c: any) => c.id === chat.id)).sort()
                )
            }
        }
    })

    it('also round trips through decodeRisuSave and the init-only file', async () => {
        const db = makeDatabase()
        const encoder = new RisuSaveEncoder({ splitChats: true, remote: false, cache: false })
        await encoder.init(db)
        const decoded = (await decodeRisuSave(new Uint8Array(encoder.encode()))).database
        expect(decoded).toEqual(db)
    })

    it('round trips with compressed blocks', async () => {
        const db = makeDatabase()
        const encoder = new RisuSaveEncoder({ splitChats: true, remote: false, cache: false })
        await encoder.init(db, { compression: true })
        await encoder.set(db, emptyToSave())
        const file = encoder.encode()
        expect(parseBlocks(file).every((b) => b.compressed)).toBe(true)
        expect(await decode(file)).toEqual(db)
    })

    it('stores chats as a non-iterable marker in the character block (older clients fail instead of loading no chats)', async () => {
        const db = makeDatabase()
        const file = (await makeSplitEncoder(db)).encode()
        const character = JSON.parse(blockMap(file).get('cha-a').content)
        expect(Array.isArray(character.chats)).toBe(false)
        expect(character.chats).toEqual({ __risuSplitChats: 1, ids: ['chat-a1', 'chat-a2', 'chat-a3'] })
        expect(() => {
            for (const chat of character.chats) {
                void chat
            }
        }).toThrow(TypeError)
    })
})

describe('legacy format', () => {
    it('is unchanged by default and decodes identically', async () => {
        const db = makeDatabase()
        const legacyFile = await encodeRisuSave(db)
        const defaultEncoder = new RisuSaveEncoder({ remote: false, cache: false })
        await defaultEncoder.init(db)
        expect(new Uint8Array(defaultEncoder.encode())).toEqual(legacyFile)

        const blocks = parseBlocks(legacyFile)
        expect(blocks.some((b) => b.type === TYPE.CHAT || b.type === TYPE.CHARACTER_WITHOUT_CHAT)).toBe(false)
        expect(blocks.filter((b) => b.type === TYPE.CHARACTER_WITH_CHAT).map((b) => b.name))
            .toEqual(['cha-a', 'cha-b', 'group-1', 'cha-empty'])
        expect(await decode(legacyFile)).toEqual(db)
    })

    it('legacy incremental saves are unchanged', async () => {
        const db = makeDatabase()
        const encoder = new RisuSaveEncoder({ remote: false, cache: false })
        await encoder.init(db)
        await encoder.set(db, emptyToSave())
        db.characters[0].chats[0].message.push({ role: 'user', data: 'new', time: 3 })
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a1']] }))
        const file = encoder.encode()
        expect(parseBlocks(file).some((b) => b.type === TYPE.CHAT || b.type === TYPE.CHARACTER_WITHOUT_CHAT)).toBe(false)
        expect(await decode(file)).toEqual(db)
    })

    it('decodes a legacy CHARACTER_WITHOUT_CHAT block that holds a full character', async () => {
        const db = makeDatabase()
        const encoder = new RisuSaveEncoder({ remote: false, cache: false })
        await encoder.init(db)
        const file = encoder.encode()
        const rebuilt: Uint8Array[] = []
        for (const block of parseBlocks(file)) {
            if (block.name === 'cha-b') {
                rebuilt.push(await encoder.encodeRawBlock({
                    compression: false,
                    data: block.content,
                    type: TYPE.CHARACTER_WITHOUT_CHAT,
                    name: block.name,
                    cache: false,
                }))
            }
            else {
                rebuilt.push(block.raw)
            }
        }
        expect(await decode(assembleBlocks(rebuilt))).toEqual(db)
    })
})

describe('per-character fallback to the legacy block', () => {
    async function expectLegacyFallback(db: any, chaId: string) {
        const before = clone(db)
        const file = (await makeSplitEncoder(db)).encode()
        expect(db).toEqual(before)
        expect(blockMap(file).get(chaId).type).toBe(TYPE.CHARACTER_WITH_CHAT)
        expect(chatBlocksOf(file, chaId)).toHaveLength(0)
        //other characters are still split
        expect(blockMap(file).get('cha-b').type).toBe(TYPE.CHARACTER_WITHOUT_CHAT)
        expectNoStaleBlocks(file, db)
        expect(await decode(file)).toEqual(db)
    }

    it('a chat without id', async () => {
        const db = makeDatabase()
        db.characters[0].chats.push(makeChat(undefined, 'no id', makeMessages(2)))
        await expectLegacyFallback(db, 'cha-a')
    })

    it('duplicate chat ids', async () => {
        const db = makeDatabase()
        db.characters[0].chats.push(makeChat('chat-a1', 'duplicate', makeMessages(2)))
        await expectLegacyFallback(db, 'cha-a')
    })

    it('a block name over 255 bytes', async () => {
        const db = makeDatabase()
        db.characters[0].chats[1].id = '가'.repeat(84) //252 bytes, the block name gets longer than 255
        await expectLegacyFallback(db, 'cha-a')
    })

    it('a chaId that collides with a chat block name', async () => {
        const db = makeDatabase()
        db.characters.push(makeCharacter('chat-cha-a-chat-a1', [makeChat('x-1', 'x', [])]))
        await expectLegacyFallback(db, 'cha-a')
    })

    it('chats that is not an array', async () => {
        const db = makeDatabase()
        db.characters[0].chats = { not: 'an array' }
        const file = (await makeSplitEncoder(db)).encode()
        expect(blockMap(file).get('cha-a').type).toBe(TYPE.CHARACTER_WITH_CHAT)
        expect(chatBlocksOf(file, 'cha-a')).toHaveLength(0)
        expect(await decode(file)).toEqual(db)
    })

    it('a character that would be saved as a remote block', async () => {
        mocks.platform.isNodeServer = true
        mocks.dbSettings.enableRemoteSaving = true
        const db = makeDatabase()
        const encoder = new RisuSaveEncoder({ splitChats: true, cache: false })
        await encoder.init(db, { skipRemoteSavingOnCharacters: false })
        await encoder.set(db, emptyToSave())
        const file = encoder.encode()
        const blocks = parseBlocks(file)
        expect(blocks.some((b) => b.type === TYPE.CHAT || b.type === TYPE.CHARACTER_WITHOUT_CHAT)).toBe(false)
        const remote = blocks.find((b) => b.name === 'cha-a')
        expect(remote.type).toBe(TYPE.REMOTE)
        expect(JSON.parse(remote.content).type).toBe(TYPE.CHARACTER_WITH_CHAT)
        expect(mocks.forage.has('remotes/cha-a.local.bin')).toBe(true)
        expect(await decode(file)).toEqual(db)
    })

    it('a chat block name of exactly 255 bytes is split, 256 bytes is legacy', async () => {
        const db = makeDatabase()
        //'chat-' + 240 + '-' + 'chat-long' = 255 bytes
        db.characters[3].chaId = 'c'.repeat(240)
        db.characters[3].chats = [makeChat('chat-long', 'long', [])]
        let file = (await makeSplitEncoder(db)).encode()
        expect(blockMap(file).get('c'.repeat(240)).type).toBe(TYPE.CHARACTER_WITHOUT_CHAT)
        expect(await decode(file)).toEqual(db)

        db.characters[3].chaId = 'c'.repeat(241)
        file = (await makeSplitEncoder(db)).encode()
        expect(blockMap(file).get('c'.repeat(241)).type).toBe(TYPE.CHARACTER_WITH_CHAT)
        expect(chatBlocksOf(file, 'c'.repeat(241))).toHaveLength(0)
        expect(await decode(file)).toEqual(db)
    })
})

describe('incremental set', () => {
    it('modifying one chat only re-encodes that chat block', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        const before = blockMap(encoder.encode())

        db.characters[0].chats[2].message.push({ role: 'user', data: 'changed', time: 9 })
        //not marked dirty: proves only the listed chat is re-encoded
        db.characters[0].chats[0].note = 'unsaved change'
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a3']] }))
        const file = encoder.encode()
        const after = blockMap(file)

        const changed = [...after.keys()].filter((name) => !before.has(name) || !equalBytes(before.get(name).raw, after.get(name).raw))
        expect(changed).toEqual(['chat-cha-a-chat-a3'])
        expect([...before.keys()]).toEqual([...after.keys()])

        const decoded = await decode(file)
        expect(decoded.characters[0].chats[2]).toEqual(db.characters[0].chats[2])
        expect(decoded.characters[0].chats[0].note).toBe('note of First')
    })

    it('a dirty character without chat information re-encodes all its chats', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        db.characters[0].chats[0].note = 'changed 1'
        db.characters[0].chats[2].note = 'changed 3'
        await encoder.set(db, emptyToSave({ character: ['cha-a'] }))
        expect(await decode(encoder.encode())).toEqual(db)
    })

    it('allChats re-encodes all chats of the character', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        db.characters[0].chats[0].note = 'changed 1'
        db.characters[0].chats[2].note = 'changed 3'
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a2']], allChats: ['cha-a'] }))
        expect(await decode(encoder.encode())).toEqual(db)
    })

    it('adding a chat creates its block even if it is not listed as dirty', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        db.characters[0].chats.push(makeChat('chat-a4', 'New', makeMessages(4, 'a4')))
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a2']] }))
        const file = encoder.encode()
        expect(blockMap(file).has('chat-cha-a-chat-a4')).toBe(true)
        expectNoStaleBlocks(file, db)
        expect(await decode(file)).toEqual(db)
    })

    it('deleting a chat removes its block and it is not resurrected from the block cache', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db, { cache: true })
        expect(mocks.cache.has('risuSaveBlock_chat-cha-a-chat-a1')).toBe(true)
        db.characters[0].chats.splice(0, 1)
        db.characters[0].chatPage = 0
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a2']] }))
        const file = encoder.encode()
        expect(blockMap(file).has('chat-cha-a-chat-a1')).toBe(false)
        expectNoStaleBlocks(file, db)
        const decoded = await decode(file)
        expect(decoded).toEqual(db)
        expect(decoded.characters[0].chats.map((c: any) => c.id)).toEqual(['chat-a2', 'chat-a3'])
    })

    it('reordering chats only changes the character block', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        const before = blockMap(encoder.encode())
        db.characters[0].chats.reverse()
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a2']] }))
        const file = encoder.encode()
        const after = blockMap(file)
        const changed = [...after.keys()].filter((name) => !equalBytes(before.get(name).raw, after.get(name).raw))
        expect(changed).toEqual(['cha-a'])
        const decoded = await decode(file)
        expect(decoded.characters[0].chats.map((c: any) => c.id)).toEqual(['chat-a3', 'chat-a2', 'chat-a1'])
        expect(decoded).toEqual(db)
    })

    it('changing chatPage is saved', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        db.characters[0].chatPage = 2
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a3']] }))
        const decoded = await decode(encoder.encode())
        expect(decoded.characters[0].chatPage).toBe(2)
        expect(decoded).toEqual(db)
    })

    it('deleting a character removes all its blocks', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        db.characters.splice(0, 1)
        await encoder.set(db, emptyToSave({ character: ['cha-a'] }))
        const file = encoder.encode()
        expect(parseBlocks(file).filter((b) => b.name.includes('cha-a'))).toHaveLength(0)
        expectNoStaleBlocks(file, db)
        expect(await decode(file)).toEqual(db)
    })

    it('switching a character between split and legacy leaves no stale blocks', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)

        //split -> legacy (chat without id)
        db.characters[0].chats.push(makeChat(undefined, 'no id', []))
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a1']] }))
        let file = encoder.encode()
        expect(blockMap(file).get('cha-a').type).toBe(TYPE.CHARACTER_WITH_CHAT)
        expect(chatBlocksOf(file, 'cha-a')).toHaveLength(0)
        expectNoStaleBlocks(file, db)
        expect(await decode(file)).toEqual(db)

        //legacy -> split again, with a deleted chat in between
        db.characters[0].chats[3].id = 'chat-a4'
        db.characters[0].chats.splice(0, 1)
        db.characters[0].chatPage = 0
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a2']] }))
        file = encoder.encode()
        expect(blockMap(file).get('cha-a').type).toBe(TYPE.CHARACTER_WITHOUT_CHAT)
        expect(chatBlocksOf(file, 'cha-a').map((b) => b.name)).toEqual(['chat-cha-a-chat-a2', 'chat-cha-a-chat-a3', 'chat-cha-a-chat-a4'])
        expectNoStaleBlocks(file, db)
        expect(await decode(file)).toEqual(db)

        //the character block keeps its position (character order)
        expect(parseBlocks(file).filter((b) => b.type === TYPE.CHARACTER_WITHOUT_CHAT).map((b) => b.name))
            .toEqual(['cha-a', 'cha-b', 'group-1', 'cha-empty'])
    })

    it('toggling the option (full encoder reload) leaves no stale blocks', async () => {
        const db = makeDatabase()
        const split = await makeSplitEncoder(db)
        expect(parseBlocks(split.encode()).some((b) => b.type === TYPE.CHAT)).toBe(true)

        const legacy = new RisuSaveEncoder({ splitChats: false, remote: false, cache: false })
        await legacy.init(db)
        await legacy.set(db, emptyToSave())
        const legacyFile = legacy.encode()
        expect(parseBlocks(legacyFile).some((b) => b.type === TYPE.CHAT || b.type === TYPE.CHARACTER_WITHOUT_CHAT)).toBe(false)
        expectNoStaleBlocks(legacyFile, db)
        expect(await decode(legacyFile)).toEqual(db)

        const splitAgain = await makeSplitEncoder(db)
        const file = splitAgain.encode()
        expectNoStaleBlocks(file, db)
        expect(await decode(file)).toEqual(db)
    })

    it('a character saved as legacy because of remote saving becomes split later', async () => {
        mocks.platform.isNodeServer = true
        mocks.dbSettings.enableRemoteSaving = true
        const db = makeDatabase()
        const encoder = new RisuSaveEncoder({ splitChats: true, cache: false })
        await encoder.init(db, { skipRemoteSavingOnCharacters: false })
        await encoder.set(db, emptyToSave())
        mocks.dbSettings.enableRemoteSaving = false
        db.characters[0].chats[0].note = 'after remote'
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a1']] }))
        const file = encoder.encode()
        expect(blockMap(file).get('cha-a').type).toBe(TYPE.CHARACTER_WITHOUT_CHAT)
        expect(blockMap(file).get('cha-b').type).toBe(TYPE.REMOTE)
        expectNoStaleBlocks(file, db)
        expect(await decode(file)).toEqual(db)

        //and back to remote (legacy): the chat blocks are removed
        mocks.dbSettings.enableRemoteSaving = true
        await encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a1']] }))
        const file2 = encoder.encode()
        expect(blockMap(file2).get('cha-a').type).toBe(TYPE.REMOTE)
        expect(parseBlocks(file2).some((b) => b.type === TYPE.CHAT)).toBe(false)
        expect(await decode(file2)).toEqual(db)
    })

    it('a failing encode leaves the previous blocks in place', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        const before = encoder.encode()
        db.characters[0].chats[0].note = 'changed'
        const spy = vi.spyOn(encoder, 'encodeRawBlock').mockRejectedValueOnce(new Error('boom'))
        await expect(encoder.set(db, emptyToSave({ character: ['cha-a'], chat: [['cha-a', 'chat-a1']] }))).rejects.toThrow('boom')
        spy.mockRestore()
        expect(new Uint8Array(encoder.encode())).toEqual(new Uint8Array(before))
    })
})

describe('decoder robustness', () => {
    it('inserts a placeholder for a missing chat block', async () => {
        const db = makeDatabase()
        const file = (await makeSplitEncoder(db)).encode()
        const kept = parseBlocks(file).filter((b) => b.name !== 'chat-cha-a-chat-a2').map((b) => b.raw)
        const decoded = await decode(assembleBlocks(kept))
        const chats = decoded.characters[0].chats
        expect(chats.map((c: any) => c.id)).toEqual(['chat-a1', 'chat-a2', 'chat-a3'])
        expect(chats[1].message).toHaveLength(1)
        expect(chats[1].message[0].data).toContain('could not be loaded')
        expect(chats[1].message[0].data).toContain('chat-a2')
        expect(decoded.characters[0].chatPage).toBe(1)
        expect(chats[0]).toEqual(db.characters[0].chats[0])
    })

    it('loads a missing chat block from the block cache when the directory lists it', async () => {
        const db = makeDatabase()
        const file = (await makeSplitEncoder(db, { cache: true })).encode()
        const kept = parseBlocks(file).filter((b) => b.name !== 'chat-cha-b-chat-b1').map((b) => b.raw)
        expect(await decode(assembleBlocks(kept))).toEqual(db)
    })

    it('appends a chat block that is not in the order list of an existing character', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        const orphan = makeChat('chat-orphan', 'orphan', makeMessages(2))
        const extra = await encoder.encodeRawBlock({
            compression: false,
            data: JSON.stringify({ v: 1, chaId: 'cha-b', chatId: 'chat-orphan', chat: orphan }),
            type: TYPE.CHAT,
            name: 'some-other-name',
            cache: false,
        })
        const decoded = await decode(assembleBlocks([...parseBlocks(encoder.encode()).map((b) => b.raw), extra]))
        expect(decoded.characters[1].chats.map((c: any) => c.id)).toEqual(['chat-b1', 'chat-b2', 'chat-orphan'])
        expect(decoded.characters[1].chats[2]).toEqual(orphan)
    })

    it('drops a chat block whose character does not exist', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        const extra = await encoder.encodeRawBlock({
            compression: false,
            data: JSON.stringify({ v: 1, chaId: 'nobody', chatId: 'chat-x', chat: makeChat('chat-x', 'x', []) }),
            type: TYPE.CHAT,
            name: 'chat-nobody-chat-x',
            cache: false,
        })
        const decoded = await decode(assembleBlocks([...parseBlocks(encoder.encode()).map((b) => b.raw), extra]))
        expect(decoded).toEqual(db)
        expect(warn.mock.calls.some((args) => String(args[0]).includes('does not exist'))).toBe(true)
    })

    it('ignores an invalid chat block', async () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        const extra = await encoder.encodeRawBlock({
            compression: false,
            data: JSON.stringify({ chaId: 'cha-a' }),
            type: TYPE.CHAT,
            name: 'broken',
            cache: false,
        })
        const decoded = await decode(assembleBlocks([...parseBlocks(encoder.encode()).map((b) => b.raw), extra]))
        expect(decoded).toEqual(db)
    })

    it('decodes a split character stored in a remote block', async () => {
        const db = makeDatabase()
        const encoder = await makeSplitEncoder(db)
        const blocks = parseBlocks(encoder.encode())
        const characterBlock = blocks.find((b) => b.name === 'cha-a')
        mocks.forage.set('remotes/cha-a.local.bin', new TextEncoder().encode(characterBlock.content))
        const remote = await encoder.encodeRawBlock({
            compression: false,
            data: JSON.stringify({ v: 1, type: TYPE.CHARACTER_WITHOUT_CHAT, name: 'cha-a' }),
            type: TYPE.REMOTE,
            name: 'cha-a',
            cache: false,
        })
        const decoded = await decode(assembleBlocks(blocks.map((b) => b.name === 'cha-a' ? remote : b.raw)))
        //remote blocks are processed after the in-file blocks, so the character moves to the end (as before)
        const character = decoded.characters.find((c: any) => c.chaId === 'cha-a')
        expect(character).toEqual(db.characters[0])
        expect(decoded.characters).toHaveLength(4)
    })

    it('keeps chatPage valid when the stored page is out of range', async () => {
        const db = makeDatabase()
        db.characters[1].chatPage = 7
        const decoded = await decode((await makeSplitEncoder(db)).encode())
        expect(decoded.characters[1].chatPage).toBe(0)
    })
})

function equalBytes(a: Uint8Array, b: Uint8Array) {
    if (a.length !== b.length) {
        return false
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false
        }
    }
    return true
}
