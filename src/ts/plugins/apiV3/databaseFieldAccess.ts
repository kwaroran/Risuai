import isEqual from "lodash/isEqual";

export const FIELD_FILTERED_KEYS_TAG = '__partialKeys'

export const patchableDbKeys = {
    characters: 'chaId',
    modules: 'id',
} as const

type PatchableDbKey = keyof typeof patchableDbKeys

const coldStorageMarkers: Partial<Record<PatchableDbKey, string>> = {
    characters: 'coldstorage',
}

export interface DbFieldFilter {
    include?: Record<string, string[]>
    exclude?: Record<string, string[]>
}

export interface PatchTarget {
    key: PatchableDbKey
    id: string
}

export interface DatabasePatchResult {
    patched: PatchTarget[]
    missing: PatchTarget[]
    coldStored: PatchTarget[]
}

function isPlainRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isEntryId(value: unknown): value is string {
    return typeof value === 'string'
}

function isPatchableDbKey(key: string): key is PatchableDbKey {
    return Object.hasOwn(patchableDbKeys, key)
}

function isJsonSerializable(value: unknown): boolean {
    try {
        JSON.stringify(value)
        return true
    } catch {
        return false
    }
}

function alwaysKeptFields(key: PatchableDbKey): string[] {
    const coldStorageMarker = coldStorageMarkers[key]
    return coldStorageMarker ? [patchableDbKeys[key], coldStorageMarker] : [patchableDbKeys[key]]
}

function fieldListFor(filter: unknown, kind: keyof DbFieldFilter, key: string): string[] | undefined {
    if (filter == null) {
        return undefined
    }
    if (!isPlainRecord(filter)) {
        throw new Error('getDatabase expects options to be an object')
    }
    const lists = filter[kind]
    if (lists == null) {
        return undefined
    }
    if (!isPlainRecord(lists)) {
        throw new Error(`getDatabase expects "${kind}" to be an object mapping database keys to arrays of field names`)
    }
    const list = lists[key]
    if (list == null) {
        return undefined
    }
    if (!Array.isArray(list) || !list.every((field) => typeof field === 'string')) {
        throw new Error(`getDatabase expects "${kind}" for "${key}" to be an array of field names`)
    }
    return list
}

export function projectDbValue(key: string, value: unknown, filter: unknown): { value: unknown, filtered: boolean } {
    const include = fieldListFor(filter, 'include', key)
    const exclude = fieldListFor(filter, 'exclude', key)
    if ((!include && !exclude) || typeof value !== 'object' || value === null) {
        return { value, filtered: false }
    }

    let droppedAnyField = false
    const pickFields = (source: Record<string, any>, keptFields: string[] = []) => {
        const sourceFields = Object.keys(source)
        const fields = include ?? sourceFields.filter((field) => !exclude?.includes(field))
        const picked: Record<string, any> = {}
        for (const field of fields) {
            if (Object.hasOwn(source, field)) {
                picked[field] = source[field]
            }
        }
        for (const field of keptFields) {
            if (Object.hasOwn(source, field)) {
                picked[field] = source[field]
            }
        }
        if (Object.keys(picked).length < sourceFields.length) {
            droppedAnyField = true
        }
        return picked
    }

    const keptFields = isPatchableDbKey(key) ? alwaysKeptFields(key) : []
    const projected = Array.isArray(value)
        ? value.map((item) => isPlainRecord(item) ? pickFields(item, keptFields) : item)
        : pickFields(value as Record<string, any>)
    return droppedAnyField ? { value: projected, filtered: true } : { value, filtered: false }
}

export function dropFieldFilteredKeys(newDb: any): { db: any, dropped: string[] } {
    if (!isPlainRecord(newDb) || !Object.hasOwn(newDb, FIELD_FILTERED_KEYS_TAG)) {
        return { db: newDb, dropped: [] }
    }

    const { [FIELD_FILTERED_KEYS_TAG]: tagged, ...db } = newDb
    const dropped: string[] = Array.isArray(tagged)
        ? tagged.filter((key) => typeof key === 'string' && Object.hasOwn(db, key))
        : []
    for (const key of dropped) {
        delete db[key]
    }
    return { db, dropped }
}

export function applyDatabasePatch(db: Record<string, any>, patch: unknown): DatabasePatchResult {
    if (!isPlainRecord(patch)) {
        throw new Error('patchDatabase expects an object')
    }

    const targets: [PatchableDbKey, Record<string, any>[]][] = []
    for (const [key, entries] of Object.entries(patch)) {
        if (key === FIELD_FILTERED_KEYS_TAG || entries === undefined) {
            continue
        }
        if (!isPatchableDbKey(key)) {
            throw new Error(`patchDatabase does not support "${key}". Supported keys: ${Object.keys(patchableDbKeys).join(', ')}`)
        }
        const idField = patchableDbKeys[key]
        const invalidEntries = new Error(`patchDatabase expects "${key}" to be an array of objects with "${idField}"`)
        if (!Array.isArray(entries)) {
            throw invalidEntries
        }
        for (let index = 0; index < entries.length; index++) {
            const entry = entries[index]
            if (!isPlainRecord(entry) || !isEntryId(entry[idField])) {
                throw invalidEntries
            }
        }
        targets.push([key, entries])
    }

    const patched: PatchTarget[] = []
    const missing: PatchTarget[] = []
    const coldStored: PatchTarget[] = []
    const pendingWrites = new Map<Record<string, any>, Map<string, unknown>>()
    for (const [key, entries] of targets) {
        const idField = patchableDbKeys[key]
        const coldStorageMarker = coldStorageMarkers[key]
        const liveById = new Map<unknown, Record<string, any>>()
        for (const liveItem of db[key] ?? []) {
            if (isPlainRecord(liveItem) && liveItem[idField] != null && !liveById.has(liveItem[idField])) {
                liveById.set(liveItem[idField], liveItem)
            }
        }

        for (const entry of entries) {
            const liveItem = liveById.get(entry[idField])
            if (!liveItem) {
                missing.push({ key, id: entry[idField] })
                continue
            }
            const isColdStored = Boolean(coldStorageMarker && (liveItem[coldStorageMarker] || entry[coldStorageMarker]))
            let fields = pendingWrites.get(liveItem)
            for (const field of Object.keys(entry)) {
                if (field === idField) {
                    continue
                }
                const current = fields?.has(field) ? fields.get(field) : liveItem[field]
                if (isEqual(current, entry[field])) {
                    continue
                }
                if (isColdStored) {
                    coldStored.push({ key, id: entry[idField] })
                    break
                }
                if (!isJsonSerializable(entry[field])) {
                    throw new Error(`patchDatabase cannot write "${field}" of ${key} "${entry[idField]}": the value cannot be encoded as JSON`)
                }
                if (!fields) {
                    fields = new Map()
                    pendingWrites.set(liveItem, fields)
                    patched.push({ key, id: entry[idField] })
                }
                fields.set(field, entry[field])
            }
        }
    }

    for (const [liveItem, fields] of pendingWrites) {
        for (const [field, value] of fields) {
            liveItem[field] = value
        }
    }
    return { patched, missing, coldStored }
}
