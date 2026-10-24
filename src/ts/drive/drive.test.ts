import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
    token: 'token',
    db: null as any,
    cold: new Map<string, unknown>(),
    device: new Map<string, Uint8Array>(),
    restoredCold: new Map<string, unknown>(),
    errors: [] as string[],
    normals: [] as string[],
    markdowns: [] as string[],
    confirms: [] as string[],
    confirmAnswer: true,
}))

vi.mock(import('./drivePack'), async (importOriginal) => ({
    ...await importOriginal(),
    DRIVE_PACK_LIMIT: 1000,
}))

vi.mock(import('../alert'), () => ({
    alertConfirm: async (msg: string) => {
        state.confirms.push(msg)
        return state.confirmAnswer
    },
    alertError: (msg: string | Error) => { state.errors.push(`${msg}`) },
    alertInput: async () => state.token,
    alertMd: (msg: string) => { state.markdowns.push(msg) },
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
        driveBackupPartial: (files: string) => `partial: ${files}`,
        driveTokenExpiredRestore: 'expiredRestore',
        driveRestoreIncomplete: (count: number, files: string) => `incomplete ${count}: ${files}`,
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
    appProperties?: Record<string, string>
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
    private sessions = new Map<string, Omit<FakeFile, 'id' | 'data'>>()

    add(name: string, data: Uint8Array, appProperties?: Record<string, string>) {
        const file = { id: `f${this.nextId++}`, name, mimeType: 'application/octet-stream', appProperties, data }
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

        if(url.host === 'upload.test'){
            const session = this.sessions.get(url.pathname)
            const file = this.add(session.name, new Uint8Array(init.body as Uint8Array), session.appProperties)
            return json({ id: file.id })
        }
        if(url.pathname === '/drive/v3/files' && method === 'GET'){
            //small pages to exercise pagination
            const all = [...this.files.values()]
            const start = parseInt(url.searchParams.get('pageToken') ?? '0')
            const page = all.slice(start, start + 3)
            return json({
                files: page.map((file) => ({
                    id: file.id,
                    name: file.name,
                    mimeType: file.mimeType,
                    size: String(file.data.byteLength),
                    appProperties: file.appProperties,
                })),
                nextPageToken: start + 3 < all.length ? String(start + 3) : undefined,
            })
        }
        if(url.pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'resumable'){
            const metadata = JSON.parse(init.body as string)
            const path = `/session/${this.nextId++}`
            this.sessions.set(path, metadata)
            return new Response('', { status: 200, headers: { Location: `https://upload.test${path}` } })
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
            const file = this.add(metadata.name, data, metadata.appProperties)
            if(this.lostUploadResponses > 0){
                this.lostUploadResponses -= 1
                throw new TypeError('Failed to fetch')
            }
            return json({ id: file.id })
        }
        const upload = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
        if(upload && method === 'PATCH'){
            this.files.get(upload[1]).data = new Uint8Array(init.body as Uint8Array)
            return json({ id: upload[1] })
        }
        const single = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
        if(single && method === 'DELETE'){
            this.files.delete(single[1])
            return new Response(null, { status: 204 })
        }
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

function snapshotDevice() {
    return new Map(state.device)
}

async function restoreOnEmptyDevice() {
    state.device = new Map()
    state.restoredCold = new Map()
    state.db = { assets: [], coldKeys: [] }
    await checkDriver('loadtauri')
    return state.device
}

function expectRestored(restored: Map<string, Uint8Array>, expected: Map<string, Uint8Array>) {
    for(const [path, data] of expected){
        expect(restored.get(path), path).toEqual(data)
    }
}

beforeEach(() => {
    drive = new FakeDrive()
    vi.stubGlobal('fetch', drive.fetch)
    state.token = 'token'
    state.errors = []
    state.normals = []
    state.markdowns = []
    state.confirms = []
    state.confirmAnswer = true
    state.restoredCold = new Map()
})

describe('drive backup v2', () => {
    it('backs up into packs and restores everything', async () => {
        setupDevice({
            'a.png': makeData(100, 1),
            'b.mp4': makeData(3500, 2),
            'c.png': makeData(400, 3),
            'd.webp': makeData(0, 4),
        }, { chat1: { hello: 'world' } })
        const original = snapshotDevice()

        await checkDriver('savetauri')

        expect(state.errors).toEqual([])
        expect(state.normals).toEqual(['Success'])
        const packs = drive.named(/\.risupack$/)
        expect(packs.length).toBeGreaterThanOrEqual(5)
        for(const pack of packs){
            expect(pack.data.byteLength).toBeLessThanOrEqual(1000)
        }
        expect(drive.named(/-manifest\.json$/)).toHaveLength(1)

        const restored = await restoreOnEmptyDevice()
        expect(state.errors).toEqual([])
        expectRestored(restored, original)
        expect(state.restoredCold.get('chat1')).toEqual({ hello: 'world' })
        expect(JSON.parse(new TextDecoder().decode(restored.get('database/database.bin'))).name).toBe('db')
    })

    it('resumes after the token expires instead of starting over', async () => {
        setupDevice({
            'a.png': makeData(700, 1),
            'b.mp4': makeData(4000, 2),
            'c.png': makeData(600, 3),
        })
        const original = snapshotDevice()

        drive.expireAfter = 9
        await checkDriver('savetauri')
        expect(state.errors).toEqual(['expired'])
        expect(drive.named(/-manifest\.json$/)).toHaveLength(0)
        const firstRun = drive.named(/\.risupack$/)
        expect(firstRun.length).toBeGreaterThan(0)

        drive.expireAfter = null
        state.errors = []
        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.normals).toEqual(['Success'])

        //packs from the first run are kept, and no sequence number is uploaded twice
        const packs = drive.named(/\.risupack$/)
        for(const pack of firstRun){
            expect(drive.files.has(pack.id)).toBe(true)
        }
        const names = packs.map((pack) => pack.name)
        expect(new Set(names).size).toBe(names.length)
        expect(drive.named(/-plan\.json$/)).toHaveLength(1)

        expectRestored(await restoreOnEmptyDevice(), original)
    })

    it('uploads a broken last pack again', async () => {
        setupDevice({
            'a.png': makeData(700, 1),
            'b.mp4': makeData(4000, 2),
        })
        const original = snapshotDevice()

        drive.expireAfter = 8
        await checkDriver('savetauri')
        expect(state.errors).toEqual(['expired'])
        const packs = drive.named(/\.risupack$/).sort((a, b) => a.name.localeCompare(b.name))
        const last = packs[packs.length - 1]
        last.data = last.data.slice(0, last.data.byteLength - 10)

        drive.expireAfter = null
        state.errors = []
        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(drive.files.has(last.id)).toBe(false)
        expect(drive.named(new RegExp(last.name.replace(/\./g, '\\.')))).toHaveLength(1)

        expectRestored(await restoreOnEmptyDevice(), original)
    })

    it('reuses entries from the previous backup and v1 uploads', async () => {
        setupDevice({
            'a.png': makeData(300, 1),
            'legacy.png': makeData(200, 5),
        }, { chat1: { a: 1 } })
        //uploaded one by one by a v1 backup
        drive.add('legacy.png.bin', state.device.get('assets/legacy.png'))
        drive.add('coldstorage_chat1.json', new TextEncoder().encode(JSON.stringify({ a: 1 })))

        await checkDriver('savetauri')
        expect(state.normals).toEqual(['Success'])
        const firstPacks = drive.named(/\.risupack$/)
        expect(firstPacks).toHaveLength(1)

        state.device.set('assets/new.png', makeData(250, 9))
        state.db.assets.push('new.png')
        const original = snapshotDevice()
        await new Promise((resolve) => setTimeout(resolve, 2))
        await checkDriver('savetauri')

        expect(drive.named(/-manifest\.json$/)).toHaveLength(2)
        const secondPacks = drive.named(/\.risupack$/).filter((pack) => !firstPacks.includes(pack))
        expect(secondPacks).toHaveLength(1)
        expect(secondPacks[0].data.byteLength).toBeLessThan(400)

        const restored = await restoreOnEmptyDevice()
        expectRestored(restored, original)
        expect(state.restoredCold.get('chat1')).toEqual({ a: 1 })
    })

    it('leaves out unreadable files and keeps resuming past them', async () => {
        setupDevice({
            'a.png': makeData(900, 1),
            'bad.png': undefined,
            'c.png': makeData(900, 3),
            'd.png': makeData(900, 4),
        })
        const original = snapshotDevice()
        original.delete('assets/bad.png')

        //list, plan, plan update for the skipped file, packs 1 and 2, then expire on pack 3
        drive.expireAfter = 7
        await checkDriver('savetauri')
        expect(state.errors).toEqual(['expired'])
        const firstRun = drive.named(/\.risupack$/).map((pack) => pack.id)
        expect(firstRun).toHaveLength(2)

        drive.expireAfter = null
        state.errors = []
        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.markdowns).toHaveLength(1)
        expect(state.markdowns[0]).toContain('bad.png')
        //pack 2 starts after the skipped file and is still accepted as a continuation
        for(const id of firstRun){
            expect(drive.files.has(id)).toBe(true)
        }

        expectRestored(await restoreOnEmptyDevice(), original)
    })

    it('saves the plan once for files that fail one after another', async () => {
        setupDevice({
            'a.png': makeData(300, 1),
            'bad1.png': undefined,
            'bad2.png': undefined,
            'bad3.png': undefined,
            'c.png': makeData(300, 3),
        })
        const fetch = drive.fetch
        let planUpdates = 0
        vi.stubGlobal('fetch', async (input: string, init: RequestInit = {}) => {
            if(init.method === 'PATCH'){
                planUpdates += 1
            }
            return await fetch(input, init)
        })

        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.markdowns).toHaveLength(1)
        expect(planUpdates).toBe(1)
        const plan = JSON.parse(new TextDecoder().decode(drive.named(/-plan\.json$/)[0].data))
        expect(plan.skipped).toEqual([1, 2, 3])
    })

    it('keeps assets this device lost if an earlier backup still has them', async () => {
        setupDevice({
            'a.png': makeData(300, 1),
            'b.png': makeData(300, 2),
            'legacy.png': makeData(200, 5),
        })
        drive.add('legacy.png.bin', state.device.get('assets/legacy.png'))
        await checkDriver('savetauri')
        expect(state.normals).toEqual(['Success'])
        const original = snapshotDevice()

        //still referenced by the database, but gone from this device
        state.device.delete('assets/b.png')
        state.device.delete('assets/legacy.png')
        state.db.assets.push('never.png')
        state.normals = []
        await new Promise((resolve) => setTimeout(resolve, 2))
        await checkDriver('savetauri')

        expect(drive.named(/-manifest\.json$/)).toHaveLength(2)
        expect(state.normals).toEqual([])
        expect(state.markdowns).toHaveLength(1)
        expect(state.markdowns[0]).toContain('never.png')
        expect(state.markdowns[0]).not.toContain('b.png')
        expect(state.markdowns[0]).not.toContain('legacy.png')

        expectRestored(await restoreOnEmptyDevice(), original)
    })

    it('asks before replacing the database when assets cannot be restored', async () => {
        setupDevice({
            'a.png': makeData(700, 1),
            'b.png': makeData(700, 2),
        })
        await checkDriver('savetauri')
        const packs = drive.named(/\.risupack$/).sort((a, b) => a.name.localeCompare(b.name))
        const broken = packs[packs.length - 1]
        broken.data = broken.data.slice(0, broken.data.byteLength - 10)

        state.confirmAnswer = false
        let restored = await restoreOnEmptyDevice()
        expect(state.confirms).toHaveLength(1)
        expect(state.confirms[0]).toContain('b.png')
        expect(restored.has('database/database.bin')).toBe(false)
        expect(restored.get('assets/a.png')).toEqual(makeData(700, 1))

        state.confirmAnswer = true
        state.confirms = []
        restored = await restoreOnEmptyDevice()
        expect(state.confirms).toHaveLength(1)
        expect(restored.has('database/database.bin')).toBe(true)
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
        expect(drive.named(/\.risupack$/)).toHaveLength(1)
    })

    it('does not retry a 403 that is not a rate limit', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        drive.injected = [json({ error: { message: 'The user does not have sufficient permissions' } }, 403)]

        await checkDriver('savetauri')
        expect(state.errors).toEqual(['interrupted: Google Drive request failed (403): The user does not have sufficient permissions'])
        expect(drive.requests).toBe(1)
    })

    it('still restores v1 backups', async () => {
        const image = makeData(120, 7)
        drive.add('1700000000-database.risudat', new TextEncoder().encode(JSON.stringify({ name: 'old', assets: ['old.png'], coldKeys: [] })))
        drive.add('old.png.bin', image)

        const restored = await restoreOnEmptyDevice()
        expect(state.errors).toEqual([])
        expect(restored.get('assets/old.png')).toEqual(image)
    })

    it('tells the user to rerun when the token expires during restore', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        await checkDriver('savetauri')

        drive.requests = 0
        drive.expireAfter = 3
        await restoreOnEmptyDevice()
        expect(state.errors).toEqual(['expiredRestore'])
    })
    it('retries a rate limited upload', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        //the plan is the only multipart upload; packs use resumable sessions
        drive.injectedUploads = [json({ error: { message: 'Rate Limit Exceeded' } }, 429)]

        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(drive.uploads).toBe(2)
        expect(drive.named(/-plan\.json$/)).toHaveLength(1)
        expect(drive.named(/\.risupack$/)).toHaveLength(1)
    })

    it('does not resend an upload after a server error', async () => {
        setupDevice({ 'a.png': makeData(100, 1) })
        drive.injectedUploads = [new Response('Backend Error', { status: 503 })]

        await checkDriver('savetauri')
        expect(state.errors).toEqual(['interrupted: Google Drive request failed (503): Backend Error'])
        expect(drive.uploads).toBe(1)
    })

    it('does not upload the plan twice when the response is lost, and the rerun resumes it', async () => {
        setupDevice({ 'a.png': makeData(100, 1), 'b.png': makeData(100, 2) })
        drive.lostUploadResponses = 1

        await checkDriver('savetauri')
        expect(state.errors).toEqual(['interrupted: Failed to fetch'])
        expect(drive.uploads).toBe(1)
        expect(drive.named(/-plan\.json$/)).toHaveLength(1)

        state.errors = []
        await checkDriver('savetauri')
        expect(state.errors).toEqual([])
        expect(state.normals).toEqual(['Success'])
        expect(drive.named(/-plan\.json$/)).toHaveLength(1)
        expectRestored(await restoreOnEmptyDevice(), new Map([
            ['assets/a.png', makeData(100, 1)],
            ['assets/b.png', makeData(100, 2)],
        ]))
    })

    it('skips cold storage that was restored before the token expired', async () => {
        //a v1 backup keeps each cold storage item in its own file
        const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
        drive.add('1700000000-database.risudat', encode({ name: 'old', assets: [], coldKeys: ['chat1', 'chat2'] }))
        drive.add('coldstorage_chat1.json', encode({ n: 1 }))
        drive.add('coldstorage_chat2.json', encode({ n: 2 }))

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
