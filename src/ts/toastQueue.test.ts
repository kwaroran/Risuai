import { get } from 'svelte/store';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dismissActiveToast, enqueueToast, resetToastQueueForTest, toastQueueStore } from './toastQueue';

describe('toast queue', () => {
    beforeEach(() => {
        resetToastQueueForTest();
        vi.useRealTimers();
    });

    it('aggregates duplicate active toasts and refreshes the active item', () => {
        enqueueToast('Success', 'success');
        enqueueToast('Success', 'success');

        const state = get(toastQueueStore);
        expect(state.active).toMatchObject({
            message: 'Success',
            severity: 'success',
            count: 2,
            refreshKey: 1,
        });
        expect(state.queue).toHaveLength(0);
    });

    it('aggregates duplicate queued toasts', () => {
        enqueueToast('Exported', 'success');
        enqueueToast('Imported', 'success');
        enqueueToast('Imported', 'success');

        const state = get(toastQueueStore);
        expect(state.active?.message).toBe('Exported');
        expect(state.queue).toHaveLength(1);
        expect(state.queue[0]).toMatchObject({
            message: 'Imported',
            count: 2,
            refreshKey: 1,
        });
    });

    it('keeps different error statuses separate', () => {
        enqueueToast('Request failed', 'error', {
            kind: 'request',
            failureClass: 'auth',
            status: 401,
        });
        enqueueToast('Request failed', 'error', {
            kind: 'request',
            failureClass: 'rateLimit',
            status: 429,
        });

        const state = get(toastQueueStore);
        expect(state.active?.count).toBe(1);
        expect(state.queue).toHaveLength(1);
        expect(state.queue[0].count).toBe(1);
    });

    it('does not aggregate when aggregation is disabled', () => {
        enqueueToast('Alert Closed', 'success', {
            kind: 'ui',
            aggregate: false,
        });
        enqueueToast('Alert Closed', 'success', {
            kind: 'ui',
            aggregate: false,
        });

        const state = get(toastQueueStore);
        expect(state.active?.count).toBe(1);
        expect(state.queue).toHaveLength(1);
        expect(state.queue[0].count).toBe(1);
    });

    it('preserves incoming warnings over queued low severity toasts when full', () => {
        enqueueToast('Active', 'success');
        enqueueToast('Queued 1', 'success');
        enqueueToast('Queued 2', 'info');
        enqueueToast('Queued 3', 'neutral');
        enqueueToast('Queued 4', 'success');

        enqueueToast('Cannot find preset: missing', 'warning', {
            kind: 'preset',
            failureClass: 'validation',
        });

        const state = get(toastQueueStore);
        expect(state.queue).toHaveLength(4);
        expect(state.queue.some((item) => item.message === 'Cannot find preset: missing')).toBe(true);
        expect(state.queue.some((item) => item.severity === 'neutral')).toBe(false);
    });

    it('shows the next queued toast when the active one is dismissed', () => {
        enqueueToast('First', 'success');
        enqueueToast('Second', 'success');

        const firstId = get(toastQueueStore).active?.id;
        dismissActiveToast(firstId ?? -1);

        const state = get(toastQueueStore);
        expect(state.active?.message).toBe('Second');
        expect(state.queue).toHaveLength(0);
    });
});
