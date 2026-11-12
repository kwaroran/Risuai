import isEqual from "lodash/isEqual";

export const FIELD_FILTERED_KEYS_TAG = '__partialKeys'

const entryIdFields = {
    characters: 'chaId',
    modules: 'id',
} as const

type EntryListKey = keyof typeof entryIdFields

const coldStorageMarkers: Partial<Record<EntryListKey, string>> = {
    characters: 'coldstorage',
}

const unsafePathSegments = ['__proto__', 'constructor', 'prototype']

export interface DbFieldFilter {
    include?: Record<string, string[]>
    exclude?: Record<string, string[]>
}

export type DbPath = (string | number)[]

export interface DatabasePatchOptions {
    allowedKeys: readonly string[]
    readOnlyPaths: readonly DbPath[]
}

function isPlainRecord(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlainObject(value: unknown): value is Record<string, any> {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
}

function isEntryListKey(key: string): key is EntryListKey {
    return Object.hasOwn(entryIdFields, key)
}

function isJsonSerializable(value: unknown): boolean {
    try {
        JSON.stringify(value)
        return true
    } catch {
        return false
    }
}

function alwaysKeptFields(key: EntryListKey): string[] {
    const coldStorageMarker = coldStorageMarkers[key]
    return coldStorageMarker ? [entryIdFields[key], coldStorageMarker] : [entryIdFields[key]]
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

    const keptFields = isEntryListKey(key) ? alwaysKeptFields(key) : []
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

function isDbPath(value: unknown): value is DbPath {
    if (!Array.isArray(value) || value.length === 0) {
        return false
    }
    for (let index = 0; index < value.length; index++) {
        const segment = value[index]
        const isIndex = typeof segment === 'number' && Number.isInteger(segment) && segment >= 0
        const isField = typeof segment === 'string' && !unsafePathSegments.includes(segment)
        if (!isIndex && !isField) {
            return false
        }
    }
    return true
}

function describePath(path: DbPath): string {
    return path.join('.')
}

function startsWith(path: DbPath, prefix: DbPath): boolean {
    return prefix.length <= path.length && prefix.every((segment, index) => String(segment) === String(path[index]))
}

function overlaps(first: DbPath, second: DbPath): boolean {
    return startsWith(first, second) || startsWith(second, first)
}

function prefixKeys(path: DbPath): string[] {
    const keys: string[] = []
    let key = ''
    for (const segment of path) {
        key += `${JSON.stringify(String(segment))}/`
        keys.push(key)
    }
    return keys
}

function hasMember(container: unknown, segment: string | number): container is Record<string | number, any> {
    if (Array.isArray(container)) {
        return typeof segment === 'number' && segment < container.length
    }
    return isPlainObject(container) && Object.hasOwn(container, segment)
}

function parentOf(db: Record<string, any>, path: DbPath): Record<string | number, any> {
    const notFound = new Error(`patchDatabase cannot find "${describePath(path)}"`)
    let parent: unknown = db
    for (const segment of path.slice(0, -1)) {
        if (!hasMember(parent, segment)) {
            throw notFound
        }
        parent = parent[segment]
    }
    const canHoldLastSegment = Array.isArray(parent) ? hasMember(parent, path[path.length - 1]) : isPlainObject(parent)
    if (!canHoldLastSegment) {
        throw notFound
    }
    return parent as Record<string | number, any>
}

export function patchReadsDatabase(operations: unknown): boolean {
    return Array.isArray(operations) && operations.some((operation) => isPlainObject(operation) && operation.op === 'test')
}

export function applyDatabasePatch(db: Record<string, any>, operations: unknown, options: DatabasePatchOptions): { characterIds: string[] } {
    if (!Array.isArray(operations)) {
        throw new Error('patchDatabase expects an array of operations')
    }

    const writes: { path: DbPath, parent: Record<string | number, any>, value: unknown }[] = []
    const writtenKeys = new Set<string>()
    const keysHoldingAWrite = new Set<string>()
    for (let index = 0; index < operations.length; index++) {
        const operation = operations[index]
        if (!isPlainObject(operation) || !isDbPath(operation.path)) {
            throw new Error(`patchDatabase operation ${index} needs a "path" made of field names and array indexes`)
        }
        const path: DbPath = operation.path
        if (typeof path[0] !== 'string' || !options.allowedKeys.includes(path[0])) {
            throw new Error(`patchDatabase does not support "${path[0]}"`)
        }
        if (operation.op === 'test') {
            const parent = parentOf(db, path)
            const lastSegment = path[path.length - 1]
            const current = hasMember(parent, lastSegment) ? parent[lastSegment] : undefined
            if (!isEqual(current, operation.value)) {
                throw new Error(`patchDatabase test failed at "${describePath(path)}"`)
            }
            continue
        }
        if (operation.op !== 'replace') {
            throw new Error(`patchDatabase operation ${index} needs "op" to be "replace" or "test"`)
        }
        if (operation.value === undefined || !isJsonSerializable(operation.value)) {
            throw new Error(`patchDatabase cannot write "${describePath(path)}": it needs a value that can be encoded as JSON`)
        }
        const readOnlyPath = options.readOnlyPaths.find((readOnly) => overlaps(path, readOnly))
        if (readOnlyPath) {
            throw new Error(`patchDatabase cannot write "${describePath(path)}": "${describePath(readOnlyPath)}" is read-only`)
        }
        const keys = prefixKeys(path)
        const ownKey = keys[keys.length - 1]
        if (keysHoldingAWrite.has(ownKey) || keys.some((key) => writtenKeys.has(key))) {
            throw new Error(`patchDatabase cannot write "${describePath(path)}": another operation in the same patch already writes there`)
        }
        const parent = parentOf(db, path)
        const lastSegment = path[path.length - 1]
        if (!hasMember(parent, lastSegment) && lastSegment in parent) {
            throw new Error(`patchDatabase cannot create "${describePath(path)}": every object already inherits a member with that name`)
        }
        writes.push({ path, parent, value: operation.value })
        writtenKeys.add(ownKey)
        for (const key of keys.slice(0, -1)) {
            keysHoldingAWrite.add(key)
        }
    }

    const characterIds = new Set<string>()
    const collectWrittenCharacterIds = () => {
        for (const { path } of writes) {
            if (path[0] !== 'characters') {
                continue
            }
            const written = path.length === 1 ? db.characters : [db.characters?.[path[1]]]
            for (const character of Array.isArray(written) ? written : []) {
                if (isPlainObject(character) && typeof character[entryIdFields.characters] === 'string') {
                    characterIds.add(character[entryIdFields.characters])
                }
            }
        }
    }

    collectWrittenCharacterIds()
    for (const { path, parent, value } of writes) {
        parent[path[path.length - 1]] = value
    }
    collectWrittenCharacterIds()
    return { characterIds: [...characterIds] }
}
