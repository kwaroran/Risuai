import { describe, expect, it, vi } from 'vitest'
import {
    getPatchNoteRelease,
    getPatchNoteReleasePage,
    normalizePatchNoteViewState,
    patchNoteCacheTtlMs,
} from './patchNotes'

class MemoryStorage {
    values = new Map<string, string>()

    getItem(key: string): string | null {
        return this.values.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        this.values.set(key, value)
    }

    removeItem(key: string): void {
        this.values.delete(key)
    }
}

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: {
            'Content-Type': 'application/json',
        },
    })
}

function release(tagName: string, options: {prerelease?: boolean, draft?: boolean, body?: string} = {}) {
    return {
        tag_name: tagName,
        name: tagName,
        body: options.body ?? `Notes for ${tagName}`,
        published_at: '2026-07-10T00:00:00Z',
        html_url: `https://github.com/kwaroran/RisuAI/releases/tag/${tagName}`,
        draft: options.draft ?? false,
        prerelease: options.prerelease ?? false,
    }
}

describe('normalizePatchNoteViewState', () => {
    it('resets the view flag when an existing installation changes version', () => {
        const state = {
            didFirstSetup: true,
            lastPatchNoteCheckVersion: '2026.6.210',
            isUserViewLastestPatchnote: true,
        }

        normalizePatchNoteViewState(state, '2026.6.214')

        expect(state.lastPatchNoteCheckVersion).toBe('2026.6.214')
        expect(state.isUserViewLastestPatchnote).toBe(false)
    })

    it('shows the rollout once to existing installations without prior state', () => {
        const state = {didFirstSetup: true}

        normalizePatchNoteViewState(state, '2026.6.214')

        expect(state).toMatchObject({
            lastPatchNoteCheckVersion: '2026.6.214',
            isUserViewLastestPatchnote: false,
        })
    })

    it('does not force patch notes for a fresh installation', () => {
        const state = {}

        normalizePatchNoteViewState(state, '2026.6.214')

        expect(state).toMatchObject({
            lastPatchNoteCheckVersion: '2026.6.214',
            isUserViewLastestPatchnote: true,
        })
    })
})

describe('getPatchNoteRelease', () => {
    it('normalizes the version tag and reuses a valid cache entry', async () => {
        const storage = new MemoryStorage()
        const fetcher = vi.fn(async (_input: RequestInfo | URL) => jsonResponse(release('v2026.6.214')))
        const options = {
            storage,
            fetcher,
            now: () => 1_000,
        }

        const first = await getPatchNoteRelease('2026.6.214', options)
        const second = await getPatchNoteRelease('v2026.6.214', options)

        expect(first.version).toBe('2026.6.214')
        expect(second.body).toBe('Notes for v2026.6.214')
        expect(fetcher).toHaveBeenCalledTimes(1)
        expect(fetcher.mock.calls[0][0]).toContain('/tags/v2026.6.214')
    })

    it('refetches after the three-day cache lifetime', async () => {
        const storage = new MemoryStorage()
        let now = 1_000
        const fetcher = vi.fn(async () => jsonResponse(release('v2026.6.214')))
        const options = {
            storage,
            fetcher,
            now: () => now,
        }

        await getPatchNoteRelease('2026.6.214', options)
        now += patchNoteCacheTtlMs
        await getPatchNoteRelease('2026.6.214', options)

        expect(fetcher).toHaveBeenCalledTimes(2)
    })

    it('treats malformed cache data as a cache miss', async () => {
        const storage = new MemoryStorage()
        storage.setItem('risu_patch_notes_cache_v1', '{broken')
        const fetcher = vi.fn(async () => jsonResponse(release('v2026.6.214')))

        await getPatchNoteRelease('2026.6.214', {storage, fetcher})

        expect(fetcher).toHaveBeenCalledTimes(1)
    })

    it('does not cache failed requests', async () => {
        const storage = new MemoryStorage()
        const fetcher = vi.fn()
            .mockResolvedValueOnce(jsonResponse({message: 'Not Found'}, 404))
            .mockResolvedValueOnce(jsonResponse(release('v2026.6.214')))

        await expect(getPatchNoteRelease('2026.6.214', {storage, fetcher})).rejects.toThrow('status 404')
        await expect(getPatchNoteRelease('2026.6.214', {storage, fetcher})).resolves.toMatchObject({
            version: '2026.6.214',
        })
        expect(fetcher).toHaveBeenCalledTimes(2)
    })
})

describe('getPatchNoteReleasePage', () => {
    it('returns ten stable releases and refills entries filtered from GitHub pages', async () => {
        const firstPage = [
            release('v2026.6.214', {prerelease: true}),
            ...Array.from({length: 9}, (_, index) => release(`v2026.6.${213 - index}`)),
        ]
        const secondPage = [
            release('v2026.6.204', {draft: true}),
            ...Array.from({length: 9}, (_, index) => release(`v2026.6.${203 - index}`)),
        ]
        const thirdPage = [
            release('v2026.6.194'),
        ]
        const fetcher = vi.fn(async (input: RequestInfo | URL) => {
            const page = new URL(input.toString()).searchParams.get('page')
            if (page === '1') return jsonResponse(firstPage)
            if (page === '2') return jsonResponse(secondPage)
            return jsonResponse(thirdPage)
        })

        const result = await getPatchNoteReleasePage(0, {
            storage: new MemoryStorage(),
            fetcher,
        })

        expect(result.releases).toHaveLength(10)
        expect(result.releases[0].version).toBe('2026.6.213')
        expect(result.releases[9].version).toBe('2026.6.203')
        expect(result.hasPrevious).toBe(false)
        expect(result.hasNext).toBe(true)
        expect(fetcher).toHaveBeenCalledTimes(2)
    })
})
