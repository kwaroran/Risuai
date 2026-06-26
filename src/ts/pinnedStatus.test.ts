import { get } from 'svelte/store';
import { beforeEach, describe, expect, it } from 'vitest';
import {
    clearPinnedStatus,
    pinnedStatusStore,
    resetPinnedStatusForTest,
    setPinnedStatus,
    togglePinnedStatusCollapsed,
    updatePinnedStatus,
} from './pinnedStatus';

describe('pinned status store', () => {
    beforeEach(() => {
        resetPinnedStatusForTest();
    });

    it('updates an existing key instead of adding a duplicate', () => {
        setPinnedStatus({
            key: 'token-counter',
            title: 'Tokens',
            value: '120 / 8192',
            kind: 'token',
        });
        setPinnedStatus({
            key: 'token-counter',
            title: 'Tokens',
            value: '240 / 8192',
            message: 'Counting prompt tokens',
        });

        const state = get(pinnedStatusStore);
        expect(state).toHaveLength(1);
        expect(state[0]).toMatchObject({
            key: 'token-counter',
            title: 'Tokens',
            value: '240 / 8192',
            message: 'Counting prompt tokens',
            kind: 'token',
            severity: 'info',
        });
    });

    it('keeps different keys as separate status items', () => {
        setPinnedStatus({ key: 'token-counter', title: 'Tokens' });
        setPinnedStatus({ key: 'sync-state', title: 'Sync', severity: 'success' });

        const state = get(pinnedStatusStore);
        expect(state).toHaveLength(2);
        expect(state.map((item) => item.key)).toEqual(['token-counter', 'sync-state']);
    });

    it('clears only the requested key', () => {
        setPinnedStatus({ key: 'token-counter', title: 'Tokens' });
        setPinnedStatus({ key: 'sync-state', title: 'Sync' });

        clearPinnedStatus('token-counter');

        const state = get(pinnedStatusStore);
        expect(state).toHaveLength(1);
        expect(state[0].key).toBe('sync-state');
    });

    it('toggles collapsed state without removing the item', () => {
        setPinnedStatus({ key: 'token-counter', title: 'Tokens' });

        togglePinnedStatusCollapsed('token-counter');

        expect(get(pinnedStatusStore)[0]).toMatchObject({
            key: 'token-counter',
            collapsed: true,
        });

        togglePinnedStatusCollapsed('token-counter');

        expect(get(pinnedStatusStore)[0]).toMatchObject({
            key: 'token-counter',
            collapsed: false,
        });
    });

    it('patches an existing item while preserving collapsed state', () => {
        setPinnedStatus({ key: 'token-counter', title: 'Tokens' });
        togglePinnedStatusCollapsed('token-counter');

        updatePinnedStatus('token-counter', {
            value: '512 / 8192',
            severity: 'warning',
        });

        expect(get(pinnedStatusStore)[0]).toMatchObject({
            value: '512 / 8192',
            severity: 'warning',
            collapsed: true,
        });
    });
});
