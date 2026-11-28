import { describe, expect, it } from 'vitest'

import {
    getRemoteSaveCleanupAction,
    getRemoteSavePayloadName,
    remoteSaveCleanupGraceMs,
} from './remoteSaveCleanup'

const now = 10_000_000_000

describe('getRemoteSavePayloadName', () => {
    it('extracts the character id from remote save payload files', () => {
        expect(getRemoteSavePayloadName('character-id.local.bin')).toBe('character-id')
    })

    it('ignores metadata and unrelated files', () => {
        expect(getRemoteSavePayloadName('character-id.local.bin.meta')).toBeNull()
        expect(getRemoteSavePayloadName('character-id.bin')).toBeNull()
    })
})

describe('getRemoteSaveCleanupAction', () => {
    it('keeps payloads for active characters', () => {
        expect(getRemoteSaveCleanupAction({
            fileName: 'active-character.local.bin',
            activeCharacterIds: new Set(['active-character']),
            hasMeta: false,
            now,
        })).toBe('keep')
    })

    it('creates metadata before deleting orphaned payloads', () => {
        expect(getRemoteSaveCleanupAction({
            fileName: 'orphan-character.local.bin',
            activeCharacterIds: new Set(),
            hasMeta: false,
            now,
        })).toBe('create-meta')
    })

    it('keeps orphaned payloads inside the cleanup grace period', () => {
        expect(getRemoteSaveCleanupAction({
            fileName: 'orphan-character.local.bin',
            activeCharacterIds: new Set(),
            hasMeta: true,
            metaLastUsed: now - remoteSaveCleanupGraceMs + 1,
            now,
        })).toBe('keep')
    })

    it('deletes orphaned payloads after the cleanup grace period', () => {
        expect(getRemoteSaveCleanupAction({
            fileName: 'orphan-character.local.bin',
            activeCharacterIds: new Set(),
            hasMeta: true,
            metaLastUsed: now - remoteSaveCleanupGraceMs - 1,
            now,
        })).toBe('delete')
    })

    it('keeps orphaned payloads with malformed metadata', () => {
        expect(getRemoteSaveCleanupAction({
            fileName: 'orphan-character.local.bin',
            activeCharacterIds: new Set(),
            hasMeta: true,
            metaLastUsed: 'not-a-number',
            now,
        })).toBe('keep')
    })
})
