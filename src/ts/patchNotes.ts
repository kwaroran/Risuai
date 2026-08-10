// Change this repository URL if you want to use release notes from a fork instead.
const GITHUB_RELEASES_URL = 'https://api.github.com/repos/kwaroran/Risuai/releases'
const PATCH_NOTE_CACHE_KEY = 'risu_patch_notes_cache_v1'
const PATCH_NOTE_CACHE_VERSION = 1
const PATCH_NOTE_CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000
const PATCH_NOTE_REQUEST_TIMEOUT_MS = 10_000
const RELEASES_PER_PAGE = 10

export interface PatchNoteRelease {
    version: string
    tagName: string
    name: string
    body: string
    publishedAt: string
    url: string
}

export interface PatchNoteReleaseSummary {
    version: string
    tagName: string
    publishedAt: string
}

export interface PatchNoteReleasePage {
    releases: PatchNoteReleaseSummary[]
    page: number
    hasPrevious: boolean
    hasNext: boolean
}

export interface PatchNoteViewState {
    didFirstSetup?: boolean
    lastPatchNoteCheckVersion?: string
    isUserViewLastestPatchnote?: boolean
}

interface GitHubRelease {
    tag_name: string
    name: string | null
    body: string | null
    published_at: string | null
    html_url: string
    draft: boolean
    prerelease: boolean
}

interface CachedEntry {
    cachedAt: number
    value: unknown
}

interface PatchNoteCache {
    version: typeof PATCH_NOTE_CACHE_VERSION
    entries: Record<string, CachedEntry>
}

interface StorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

type PatchNoteFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

interface PatchNoteRequestOptions {
    fetcher?: PatchNoteFetcher
    storage?: StorageLike | null
    now?: () => number
}

function getLocalStorage(): StorageLike | null {
    try {
        return globalThis.localStorage ?? null
    } catch {
        return null
    }
}

function getCacheStorage(options: PatchNoteRequestOptions): StorageLike | null {
    return options.storage === undefined ? getLocalStorage() : options.storage
}

function emptyCache(): PatchNoteCache {
    return {
        version: PATCH_NOTE_CACHE_VERSION,
        entries: {},
    }
}

function readCache(storage: StorageLike | null, now: number): PatchNoteCache {
    if (!storage) {
        return emptyCache()
    }

    try {
        const raw = storage.getItem(PATCH_NOTE_CACHE_KEY)
        if (!raw) {
            return emptyCache()
        }

        const parsed = JSON.parse(raw) as PatchNoteCache
        if (parsed.version !== PATCH_NOTE_CACHE_VERSION || !parsed.entries || typeof parsed.entries !== 'object') {
            storage.removeItem(PATCH_NOTE_CACHE_KEY)
            return emptyCache()
        }

        let changed = false
        for (const [key, entry] of Object.entries(parsed.entries)) {
            if (
                !entry ||
                typeof entry.cachedAt !== 'number' ||
                now - entry.cachedAt >= PATCH_NOTE_CACHE_TTL_MS
            ) {
                delete parsed.entries[key]
                changed = true
            }
        }
        if (changed) {
            storage.setItem(PATCH_NOTE_CACHE_KEY, JSON.stringify(parsed))
        }
        return parsed
    } catch {
        try {
            storage.removeItem(PATCH_NOTE_CACHE_KEY)
        } catch {
            // Treat unavailable or malformed storage as a cache miss.
        }
        return emptyCache()
    }
}

function readCachedValue<T>(key: string, options: PatchNoteRequestOptions): T | null {
    const now = options.now?.() ?? Date.now()
    const cache = readCache(getCacheStorage(options), now)
    return (cache.entries[key]?.value as T | undefined) ?? null
}

function writeCachedValue(key: string, value: unknown, options: PatchNoteRequestOptions): void {
    const storage = getCacheStorage(options)
    if (!storage) {
        return
    }

    try {
        const now = options.now?.() ?? Date.now()
        const cache = readCache(storage, now)
        cache.entries[key] = {
            cachedAt: now,
            value,
        }
        storage.setItem(PATCH_NOTE_CACHE_KEY, JSON.stringify(cache))
    } catch {
        // Cache writes are best effort and must not block patch notes.
    }
}

async function fetchGitHubJson<T>(url: string, options: PatchNoteRequestOptions): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), PATCH_NOTE_REQUEST_TIMEOUT_MS)
    try {
        const response = await (options.fetcher ?? fetch)(url, {
            headers: {
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            signal: controller.signal,
        })
        if (!response.ok) {
            throw new Error(`GitHub release request failed with status ${response.status}`)
        }
        return await response.json() as T
    } finally {
        clearTimeout(timeout)
    }
}

function normalizeTag(version: string): string {
    return version.startsWith('v') ? version : `v${version}`
}

function versionFromTag(tagName: string): string {
    return tagName.startsWith('v') ? tagName.slice(1) : tagName
}

function toRelease(release: GitHubRelease): PatchNoteRelease {
    return {
        version: versionFromTag(release.tag_name),
        tagName: release.tag_name,
        name: release.name?.trim() || release.tag_name,
        body: release.body ?? '',
        publishedAt: release.published_at ?? '',
        url: release.html_url,
    }
}

function toReleaseSummary(release: GitHubRelease): PatchNoteReleaseSummary {
    return {
        version: versionFromTag(release.tag_name),
        tagName: release.tag_name,
        publishedAt: release.published_at ?? '',
    }
}

export function normalizePatchNoteViewState(state: PatchNoteViewState, currentVersion: string): void {
    const isExistingUser = state.didFirstSetup === true
    if (state.lastPatchNoteCheckVersion !== currentVersion) {
        state.lastPatchNoteCheckVersion = currentVersion
        state.isUserViewLastestPatchnote = !isExistingUser
        return
    }

    state.isUserViewLastestPatchnote ??= !isExistingUser
}

export async function getPatchNoteRelease(
    version: string,
    options: PatchNoteRequestOptions = {},
): Promise<PatchNoteRelease> {
    const tagName = normalizeTag(version)
    const cacheKey = `release:${tagName}`
    const cached = readCachedValue<PatchNoteRelease>(cacheKey, options)
    if (cached) {
        return cached
    }

    const release = await fetchGitHubJson<GitHubRelease>(
        `${GITHUB_RELEASES_URL}/tags/${encodeURIComponent(tagName)}`,
        options,
    )
    const normalized = toRelease(release)
    writeCachedValue(cacheKey, normalized, options)
    return normalized
}

async function getRawReleasePage(
    page: number,
    options: PatchNoteRequestOptions,
): Promise<GitHubRelease[]> {
    const cacheKey = `list:${page}`
    const cached = readCachedValue<GitHubRelease[]>(cacheKey, options)
    if (cached) {
        return cached
    }

    const releases = await fetchGitHubJson<GitHubRelease[]>(
        `${GITHUB_RELEASES_URL}?per_page=${RELEASES_PER_PAGE}&page=${page}`,
        options,
    )
    const metadataOnly = releases.map((release) => ({
        tag_name: release.tag_name,
        name: null,
        body: null,
        published_at: release.published_at,
        html_url: release.html_url,
        draft: release.draft,
        prerelease: release.prerelease,
    }))
    writeCachedValue(cacheKey, metadataOnly, options)
    return metadataOnly
}

export async function getPatchNoteReleasePage(
    page: number,
    options: PatchNoteRequestOptions = {},
): Promise<PatchNoteReleasePage> {
    const normalizedPage = Math.max(0, Math.floor(page))
    const requiredCount = (normalizedPage + 1) * RELEASES_PER_PAGE + 1
    const stableReleases: PatchNoteReleaseSummary[] = []
    let githubPage = 1
    let reachedEnd = false

    while (stableReleases.length < requiredCount && !reachedEnd) {
        const releases = await getRawReleasePage(githubPage, options)
        stableReleases.push(
            ...releases
                .filter((release) => !release.draft && !release.prerelease)
                .map(toReleaseSummary),
        )
        reachedEnd = releases.length < RELEASES_PER_PAGE
        githubPage += 1
    }

    const start = normalizedPage * RELEASES_PER_PAGE
    return {
        releases: stableReleases.slice(start, start + RELEASES_PER_PAGE),
        page: normalizedPage,
        hasPrevious: normalizedPage > 0,
        hasNext: stableReleases.length > start + RELEASES_PER_PAGE,
    }
}

export function clearPatchNoteCache(storage: StorageLike | null = getLocalStorage()): void {
    try {
        storage?.removeItem(PATCH_NOTE_CACHE_KEY)
    } catch {
        // Cache cleanup is best effort.
    }
}

export const patchNoteCacheTtlMs = PATCH_NOTE_CACHE_TTL_MS
