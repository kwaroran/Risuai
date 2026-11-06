import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-fs', () => ({
    BaseDirectory: { AppData: 'AppData' },
    writeFile: vi.fn(),
}))
vi.mock('@tauri-apps/plugin-process', () => ({ relaunch: vi.fn() }))
vi.mock('localforage', () => ({ default: {} }))
vi.mock('../alert', () => ({
    alertError: vi.fn(),
    alertNormal: vi.fn(),
    alertWait: vi.fn(),
    alertStore: { set: vi.fn() },
}))
vi.mock('../globalApi.svelte', () => ({
    forageStorage: { setItem: vi.fn(), isAccount: false },
    requiresFullEncoderReload: { state: false },
}))
vi.mock('../storage/risuSave', () => ({ decodeRisuSave: vi.fn() }))
vi.mock('../storage/saveKV', () => ({ saveKV: { load: vi.fn() } }))
vi.mock('../storage/database.svelte', () => ({ setDatabaseLite: vi.fn() }))
vi.mock('../util', () => ({ decryptBuffer: vi.fn(), sleep: vi.fn() }))
vi.mock('../characterCards', () => ({}))
vi.mock('src/lang', () => ({ language: {} }))
vi.mock('../stores.svelte', () => ({ DBState: {} }))
vi.mock('../process/coldstorageData', () => ({ getPluginStorageIndexPointer: vi.fn() }))
vi.mock('../process/coldstorage.svelte', () => ({
    listPluginStorageColdKeys: vi.fn(() => []),
    listColdDataKeys: vi.fn(async () => []),
    pluginStorage: { referencedIds: vi.fn(async () => []) },
    confirmIncompleteColdStorageOperation: vi.fn(async () => true),
    setColdStorageItem: vi.fn(),
}))

import { writeFile } from '@tauri-apps/plugin-fs'
import { relaunch } from '@tauri-apps/plugin-process'
import { alertError, alertNormal, alertStore } from '../alert'
import { forageStorage, requiresFullEncoderReload } from '../globalApi.svelte'
import { decodeRisuSave } from '../storage/risuSave'
import { saveKV } from '../storage/saveKV'
import { setDatabaseLite } from '../storage/database.svelte'
import { decryptBuffer } from '../util'
import { confirmIncompleteColdStorageOperation, setColdStorageItem } from '../process/coldstorage.svelte'

describe.each([false, true])('LoadLocalBackup (isTauri: %s)', (isTauri) => {
    const ciphertext = new Uint8Array([255, 1, 2, 3])
    const plaintext = new Uint8Array([4, 5, 6])
    const database = { characters: [], pluginCustomStorage: {} }
    const kv = {}
    const fetchMock = vi.fn()
    const reload = vi.fn()
    let LoadLocalBackup: typeof import('./backuplocal').LoadLocalBackup

    beforeEach(async () => {
        vi.resetModules()
        vi.clearAllMocks()
        vi.doMock('src/ts/platform', () => ({ isTauri }))
        fetchMock.mockReset().mockResolvedValue({ ok: true, json: async () => ({ key: ' test-key ' }) })
        vi.stubGlobal('fetch', fetchMock)
        vi.stubGlobal('location', { set search(value: string) { reload(value) } })
        vi.spyOn(console, 'error').mockImplementation(() => {})
        vi.mocked(decryptBuffer).mockReset().mockResolvedValue(plaintext.buffer)
        vi.mocked(decodeRisuSave).mockResolvedValue({ database, kv } as Awaited<ReturnType<typeof decodeRisuSave>>)
        requiresFullEncoderReload.state = false
        LoadLocalBackup = (await import('./backuplocal')).LoadLocalBackup
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    async function restore(encrypted = true) {
        const entries: [string, Uint8Array][] = []
        if (encrypted) {
            entries.push(['encryption.risudat', new TextEncoder().encode(JSON.stringify({ type: 'account', time: 123 }))])
        }
        entries.push(['database.risudat', ciphertext])
        const chunks = entries.map(([name, data]) => {
            const nameBytes = new TextEncoder().encode(name)
            return Buffer.concat([
                new Uint8Array(new Uint32Array([nameBytes.length]).buffer),
                nameBytes,
                new Uint8Array(new Uint32Array([data.length]).buffer),
                data,
            ])
        })
        const bytes = Buffer.concat(chunks)
        const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {})
        LoadLocalBackup()
        const input = click.mock.contexts[0] as HTMLInputElement
        let done = false
        Object.defineProperty(input, 'files', { value: [{
            size: bytes.length,
            stream: () => ({ getReader: () => ({ read: async () => {
                if (done) return { done: true }
                done = true
                return { done: false, value: bytes }
            } }) }),
        }] })
        await input.onchange.call(input, new Event('change'))
    }

    function expectStopped(message: string) {
        expect(decodeRisuSave).not.toHaveBeenCalled()
        expect(alertError).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(message))
        expect(setDatabaseLite).not.toHaveBeenCalled()
        expect(saveKV.load).not.toHaveBeenCalled()
        expect(confirmIncompleteColdStorageOperation).not.toHaveBeenCalled()
        expect(setColdStorageItem).not.toHaveBeenCalled()
        expect(writeFile).not.toHaveBeenCalled()
        expect(forageStorage.setItem).not.toHaveBeenCalled()
        expect(requiresFullEncoderReload.state).toBe(false)
        expect(relaunch).not.toHaveBeenCalled()
        expect(reload).not.toHaveBeenCalled()
        expect(alertStore.set).not.toHaveBeenCalled()
        expect(alertNormal).not.toHaveBeenCalled()
    }

    it('stops restore when decryption rejects', async () => {
        vi.mocked(decryptBuffer).mockRejectedValue(new DOMException('Backup authentication failed', 'OperationError'))
        await restore()
        expectStopped('Backup authentication failed')
    })

    it('reports HTTP failure before parsing the key response', async () => {
        const response = new Response('<html>Forbidden</html>', { status: 403 })
        const json = vi.spyOn(response, 'json')
        fetchMock.mockResolvedValue(response)
        await restore()
        expectStopped('403')
        expect(json).not.toHaveBeenCalled()
        expect(decryptBuffer).not.toHaveBeenCalled()
    })

    it.each([
        ['network', () => Promise.reject(new TypeError('Failed to fetch')), 'Failed to fetch'],
        ['JSON', () => Promise.resolve({ ok: true, json: () => Promise.reject(new SyntaxError('Invalid JSON')) }), 'Invalid JSON'],
    ])('stops restore on a %s failure', async (_name, response, message) => {
        fetchMock.mockImplementation(response)
        await restore()
        expectStopped(message)
        expect(decryptBuffer).not.toHaveBeenCalled()
    })

    it.each([undefined, null, 123, '', '   '])('rejects an invalid key: %s', async (key) => {
        fetchMock.mockResolvedValue({ ok: true, json: async () => ({ key }) })
        await restore()
        expectStopped('Invalid encryption key response')
        expect(decryptBuffer).not.toHaveBeenCalled()
    })

    it.each([true, false])('restores a valid backup (encrypted: %s)', async (encrypted) => {
        await restore(encrypted)
        if (encrypted) {
            expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://sv.risuai.xyz/cryptokey?key=123')
            expect(decryptBuffer).toHaveBeenCalledExactlyOnceWith(ciphertext, ' test-key ')
        } else {
            expect(fetchMock).not.toHaveBeenCalled()
            expect(decryptBuffer).not.toHaveBeenCalled()
        }
        const restoredBytes = encrypted ? plaintext : ciphertext
        expect(decodeRisuSave).toHaveBeenCalledExactlyOnceWith(restoredBytes)
        expect(setDatabaseLite).toHaveBeenCalledExactlyOnceWith(database)
        expect(saveKV.load).toHaveBeenCalledExactlyOnceWith(kv)
        expect(confirmIncompleteColdStorageOperation).toHaveBeenCalledExactlyOnceWith(database, [], 'restore')
        expect(requiresFullEncoderReload.state).toBe(true)
        if (isTauri) {
            expect(writeFile).toHaveBeenCalledExactlyOnceWith('database/database.bin', restoredBytes, { baseDir: 'AppData' })
            expect(relaunch).toHaveBeenCalledOnce()
            expect(forageStorage.setItem).not.toHaveBeenCalled()
        } else {
            expect(forageStorage.setItem).toHaveBeenCalledExactlyOnceWith('database/database.bin', restoredBytes)
            expect(reload).toHaveBeenCalledExactlyOnceWith('')
            expect(writeFile).not.toHaveBeenCalled()
        }
        expect(alertError).not.toHaveBeenCalled()
        expect(alertNormal).toHaveBeenCalledExactlyOnceWith('Success')
    })
})
