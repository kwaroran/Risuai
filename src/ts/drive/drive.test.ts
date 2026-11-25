import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
    token: 'token',
    db: null as any,
    cold: new Map<string, unknown>(),
    device: new Map<string, Uint8Array>(),
    restoredCold: new Map<string, unknown>(),
    errors: [] as string[],
    normals: [] as string[],
}))

vi.mock(import('../alert'), () => ({
    alertConfirm: async () => true,
    alertError: (msg: string | Error) => { state.errors.push(`${msg}`) },
    alertInput: async () => state.token,
    alertNormal: (msg: string) => { state.normals.push(msg) },
    alertSelect: async () => '0',
    alertStore: { set: () => {} },
}) as any)

vi.mock(import('../storage/database.svelte'), () => ({
    getDatabase: () => state.db,
}) as any)

vi.mock(import('../globalApi.svelte'), () => ({
    forageStorage: {},
    getUncleanables: async (db: any) => [...db.assets],
    openURL: () => {},
}) as any)

vi.mock(import('../platform'), () => ({ isTauri: true }) as any)

vi.mock(import('@tauri-apps/plugin-fs'), () => ({
    BaseDirectory: { AppData: 0 },
    exists: async (path: string) => state.device.has(path),
    readDir: async () => [...state.device.keys()]
        .filter((path) => path.startsWith('assets/'))
        .map((path) => ({ name: path.slice('assets/'.length) })),
    readFile: async (path: string) => {
        const data = state.device.get(path)
        if(!data){
            throw new Error(`missing ${path}`)
        }
        return data
    },
    writeFile: async (path: string, data: Uint8Array) => { state.device.set(path, new Uint8Array(data)) },
}) as any)

vi.mock(import('@tauri-apps/plugin-process'), () => ({ relaunch: async () => {} }) as any)

vi.mock(import('../../lang'), () => ({
    language: {
        driveTokenExpiredBackup: 'expired',
        driveBackupInterrupted: (error: string) => `interrupted: ${error}`,
        driveTokenExpiredRestore: 'expiredRestore',
        loadLatest: 'latest',
        loadOthers: 'others',
        pasteAuthCode: 'paste',
    },
}) as any)

vi.mock(import('../util'), () => ({ sleep: async () => {} }) as any)
vi.mock(import('../characterCards'), () => ({ hubURL: '' }) as any)

vi.mock(import('../storage/risuSave'), () => ({
    encodeRisuSave: async (db: any) => new TextEncoder().encode(JSON.stringify(db)),
    decodeRisuSave: async (data: Uint8Array) => ({ database: JSON.parse(new TextDecoder().decode(data)), kv: {} }),
}) as any)

vi.mock(import('../storage/saveKV'), () => ({
    saveKV: {},
    saveKVSourceFromData: (kv: unknown) => kv,
}) as any)

vi.mock(import('../process/coldstorage.svelte'), () => ({
    collectColdStorageBackupPayloads: async () => ({
        payloads: [...state.cold].map(([key, value]) => ({
            key,
            backupName: `coldstorage_${key}.json`,
            value,
            encoded: new TextEncoder().encode(JSON.stringify(value)),
        })),
        missingKeys: [],
        invalidKeys: [],
    }),
    confirmIncompleteColdStorageOperation: async () => true,
    getColdStorageBackupName: (key: string) => `coldstorage_${key}.json`,
    getColdStorageItem: async (key: string) => state.restoredCold.get(key) ?? null,
    isValidColdStorageItem: () => true,
    listColdDataKeysFromDb: (db: any) => [...db.coldKeys],
    listPluginStorageColdKeys: () => [],
    pluginStorage: { referencedIds: async () => [] },
    setColdStorageItem: async (key: string, value: unknown) => {
        state.restoredCold.set(key, value)
        return true
    },
}) as any)

import { checkDriver, checkDriverInit } from './drive'

type FakeFile = {
    id: string
    name: string
    mimeType: string
    data: Uint8Array
}

class FakeDrive {
    files = new Map<string, FakeFile>()
    requests = 0
    //requests after this count get 401
    expireAfter: number | null = null
    //returned instead of handling the next requests, one per request
    injected: Response[] = []
    //returned instead of handling the next uploads, one per upload
    injectedUploads: Response[] = []
    //uploads that store the file and then lose the response, like a dropped connection
    lostUploadResponses = 0
    uploads = 0
    //names of downloaded files, in order
    downloads: string[] = []
    private nextId = 1

    add(name: string, data: Uint8Array) {
        const file = { id: `f${this.nextId++}`, name, mimeType: 'application/octet-stream', data }
        this.files.set(file.id, file)
        return file
    }

    named(pattern: RegExp) {
        return [...this.files.values()].filter((file) => pattern.test(file.name))
    }

    fetch = async (input: string, init: RequestInit = {}) => {
        if(input.startsWith('/drive/token')){
            return json({ access_token: 'token', expires_in: 3600 })
        }
        this.requests += 1
        if(this.expireAfter !== null && this.requests > this.expireAfter){
            return json({ error: { message: 'Invalid Credentials' } }, 401)
        }
        const injected = this.injected.shift()
        if(injected){
            return injected
        }
        const url = new URL(input)
        const method = init.method ?? 'GET'

        if(url.pathname === '/drive/v3/files' && method === 'GET'){
            //small pages to exercise pagination
            const all = [...this.files.values()]
            const start = parseInt(url.searchParams.get('pageToken') ?? '0')
            const page = all.slice(start, start + 3)
            return json({
                files: page.map((file) => ({ id: file.id, name: file.name, mimeType: file.mimeType })),
                nextPageToken: start + 3 < all.length ? String(start + 3) : undefined,
            })
        }
        if(url.pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart'){
            this.uploads += 1
            const injectedUpload = this.injectedUploads.shift()
            if(injectedUpload){
                return injectedUpload
            }
            const form = init.body as FormData
            const metadata = JSON.parse(await (form.get('metadata') as Blob).text())
            const data = new Uint8Array(await (form.get('file') as Blob).arrayBuffer())
            const file = this.add(metadata.name, data)
            if(this.lostUploadResponses > 0){
                this.lostUploadResponses -= 1
                throw new TypeError('Failed to fetch')
            }
            return json({ id: file.id })
        }
        const single = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
        if(single && url.searchParams.get('alt') === 'media'){
            const file = this.files.get(single[1])
            if(!file){
                return json({ error: { message: 'not found' } }, 404)
            }
            this.downloads.push(file.name)
            return new Response(file.data.slice(), { status: 200 })
        }
        throw new Error(`Unexpected request ${method} ${input}`)
    }
}

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function makeData(size: number, seed: number) {
    const data = new Uint8Array(size)
    for(let i = 0; i < size; i++){
        data[i] = (i * 17 + seed) & 0xff
    }
    return data
}

let drive: FakeDrive

function setupDevice(assets: Record<string, Uint8Array>, cold: Record<string, unknown> = {}) {
    state.device = new Map(Object.entries(assets).map(([name, data]) => [`assets/${name}`, data]))
    state.cold = new Map(Object.entries(cold))
    state.db = { name: 'db', assets: Object.keys(assets), coldKeys: Object.keys(cold) }
}

async function restoreOnEmptyDevice() {
    state.device = new Map()
    state.restoredCold = new Map()
    state.db = { assets: [], coldKeys: [] }
    await checkDriver('loadtauri')
    return state.device
}

beforeEach(() => {
    drive = new FakeDrive()
    vi.stubGlobal('fetch', drive.fetch)
    state.token = 'token'
    state.errors = []
    state.normals = []
    state.restoredCold = new Map()
})

describe('drive backup requests', () => {
    it('backs up and restores across listing pages', async () => {
        const assets = {
            'a.png': makeData(100, 1),
            'b.png': makeData(200, 2),
            'c.png': makeData(300, 3),
            'd.png': makeData(400, 4),
        }
        setupDevice(assets, { chat1: { hello: 'world' } })

        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.normals).toEqual(['Success'])
        expect(drive.files.size).toBe(6)

        const restored = await restoreOnEmptyDevice()
        expect(state.errors).toEqual([])
        for(const [name, data] of Object.entries(assets)){
            expect(restored.get(`assets/${name}`), name).toEqual(data)
        }
        expect(state.restoredCold.get('chat1')).toEqual({ hello: 'world' })
    })

    it('retries rate limits and server errors', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        drive.injected = [
            json({ error: { message: 'Rate Limit Exceeded' } }, 429),
            json({ error: { message: 'User rate limit exceeded.' } }, 403),
            new Response('Backend Error', { status: 503 }),
        ]

        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.normals).toEqual(['Success'])
        expect(drive.named(/^a\.png\.bin$/)).toHaveLength(1)
    })

    it('does not retry a 403 that is not a rate limit', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        drive.injected = [json({ error: { message: 'The user does not have sufficient permissions' } }, 403)]

        await checkDriver('savetauri')
        expect(state.errors).toEqual(['interrupted: Google Drive request failed (403): The user does not have sufficient permissions'])
        expect(drive.requests).toBe(1)
    })

    it('tells the user to rerun when the token expires, and the rerun skips uploaded files', async () => {
        setupDevice({
            'a.png': makeData(100, 1),
            'b.png': makeData(100, 2),
            'c.png': makeData(100, 3),
        })

        //list, then two uploads
        drive.expireAfter = 3
        await checkDriver('savetauri')
        expect(state.errors).toEqual(['expired'])
        expect(drive.files.size).toBe(2)

        drive.expireAfter = null
        state.errors = []
        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.normals).toEqual(['Success'])
        const names = [...drive.files.values()].map((file) => file.name)
        expect(new Set(names).size).toBe(names.length)
        expect(drive.named(/\.png\.bin$/)).toHaveLength(3)
    })

    it('tells the user to rerun when the token expires during restore', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        await checkDriver('savetauri')

        drive.requests = 0
        drive.expireAfter = 2
        await restoreOnEmptyDevice()
        expect(state.errors).toEqual(['expiredRestore'])
    })
    it('retries a rate limited upload', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        drive.injectedUploads = [json({ error: { message: 'Rate Limit Exceeded' } }, 429)]

        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(drive.named(/^a\.png\.bin$/)).toHaveLength(1)
    })

    it('does not resend an upload after a server error', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        drive.injectedUploads = [new Response('Backend Error', { status: 503 })]

        await checkDriver('savetauri')
        expect(state.errors).toEqual(['interrupted: Google Drive request failed (503): Backend Error'])
        expect(drive.uploads).toBe(1)
    })

    it('does not upload a file twice when the response is lost, and the rerun skips it', async () => {
        setupDevice({ 'a.png': makeData(100, 1), 'b.png': makeData(100, 2) })
        drive.lostUploadResponses = 1

        await checkDriver('savetauri')
        expect(state.errors).toEqual(['interrupted: Failed to fetch'])
        expect(drive.named(/^a\.png\.bin$/)).toHaveLength(1)

        state.errors = []
        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.normals).toEqual(['Success'])
        expect(drive.named(/^a\.png\.bin$/)).toHaveLength(1)
        expect(drive.named(/^b\.png\.bin$/)).toHaveLength(1)
    })

    it('skips cold storage that was restored before the token expired', async () => {
        setupDevice({}, { chat1: { n: 1 }, chat2: { n: 2 } })
        await checkDriver('savetauri')

        state.device = new Map()
        state.restoredCold = new Map()
        state.db = { assets: [], coldKeys: [] }
        //list, database, chat1, then chat2 gets 401
        drive.requests = 0
        drive.expireAfter = 3
        await checkDriver('loadtauri')
        expect(state.errors).toEqual(['expiredRestore'])
        expect(state.restoredCold.get('chat1')).toEqual({ n: 1 })

        drive.expireAfter = null
        drive.downloads = []
        state.errors = []
        await checkDriver('loadtauri')
        expect(state.errors).toEqual([])
        expect(state.restoredCold.get('chat2')).toEqual({ n: 2 })
        expect(drive.downloads).not.toContain('coldstorage_chat1.json')
        expect(drive.downloads).toContain('coldstorage_chat2.json')
    })
})

describe('drive web callback', () => {
    function openCallback(action: 'save' | 'load') {
        const driveState = `${action}.check`
        sessionStorage.setItem('risuDriveState', driveState)
        window.history.replaceState({}, '', `/?code=code&state=${driveState}`)
    }

    it('lets the app load after a failed backup', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        drive.expireAfter = 0
        openCallback('save')

        expect(await checkDriverInit()).toBe(false)
        expect(state.errors).toEqual(['expired'])
        expect(location.search).toBe('')
    })

    it('lets the app load after a failed restore', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        await checkDriver('savetauri')
        drive.requests = 0
        drive.expireAfter = 1
        openCallback('load')

        expect(await checkDriverInit()).toBe(false)
        expect(state.errors).toEqual(['expiredRestore'])
    })

    it('keeps the driver page after a successful backup', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        openCallback('save')

        expect(await checkDriverInit()).toBe(true)
        expect(state.normals).toEqual(['Success'])
    })
})
