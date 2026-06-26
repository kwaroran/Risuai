import { writable } from "svelte/store";
import type { AlertSeverity, ToastOptions, ToastQueueItem } from "./alertModel";

const MAX_TOASTS = 5;
const MAX_QUEUED_TOASTS = MAX_TOASTS - 1;

type ToastQueueState = {
    active: ToastQueueItem | null;
    queue: ToastQueueItem[];
}

const severityRank: Record<AlertSeverity, number> = {
    error: 4,
    warning: 3,
    info: 2,
    success: 1,
    neutral: 0,
};

let nextToastId = 1;

export const toastQueueStore = writable<ToastQueueState>({
    active: null,
    queue: [],
});

export function normalizeToastMessage(message: string) {
    return message.trim().replace(/\s+/g, ' ');
}

export function getToastDedupeKey(message: string, severity: AlertSeverity, options: ToastOptions = {}) {
    if (options.dedupeKey) {
        return options.dedupeKey;
    }

    return [
        severity,
        options.kind ?? '',
        options.failureClass ?? '',
        options.status ?? '',
        options.provider ?? '',
        options.model ?? '',
        options.source ?? '',
        normalizeToastMessage(message),
    ].join('|');
}

function createToastItem(message: string, severity: AlertSeverity, options: ToastOptions): ToastQueueItem {
    const now = Date.now();

    return {
        id: nextToastId++,
        message,
        severity,
        dedupeKey: getToastDedupeKey(message, severity, options),
        aggregate: options.aggregate !== false,
        count: 1,
        refreshKey: 0,
        createdAt: now,
        updatedAt: now,
    };
}

function incrementToast(item: ToastQueueItem): ToastQueueItem {
    return {
        ...item,
        count: item.count + 1,
        refreshKey: item.refreshKey + 1,
        updatedAt: Date.now(),
    };
}

function shouldKeepIncomingOverQueued(incoming: ToastQueueItem) {
    return incoming.severity === 'warning' || incoming.severity === 'error';
}

function findReplaceableQueuedIndex(queue: ToastQueueItem[]) {
    let replaceIndex = -1;
    let replaceRank = Number.POSITIVE_INFINITY;
    let replaceUpdatedAt = Number.POSITIVE_INFINITY;

    queue.forEach((item, index) => {
        const rank = severityRank[item.severity];
        if (rank > severityRank.info) {
            return;
        }

        if (rank < replaceRank || (rank === replaceRank && item.updatedAt < replaceUpdatedAt)) {
            replaceIndex = index;
            replaceRank = rank;
            replaceUpdatedAt = item.updatedAt;
        }
    });

    return replaceIndex;
}

export function enqueueToast(message: string, severity: AlertSeverity = 'info', options: ToastOptions = {}) {
    const incoming = createToastItem(message, severity, options);

    toastQueueStore.update((state) => {
        if (incoming.aggregate) {
            if (state.active?.aggregate && state.active.dedupeKey === incoming.dedupeKey) {
                return {
                    ...state,
                    active: incrementToast(state.active),
                };
            }

            const queuedIndex = state.queue.findIndex((item) => item.aggregate && item.dedupeKey === incoming.dedupeKey);
            if (queuedIndex !== -1) {
                const queue = [...state.queue];
                queue[queuedIndex] = incrementToast(queue[queuedIndex]);
                return {
                    ...state,
                    queue,
                };
            }
        }

        if (!state.active) {
            return {
                active: incoming,
                queue: state.queue,
            };
        }

        if (state.queue.length < MAX_QUEUED_TOASTS) {
            return {
                ...state,
                queue: [...state.queue, incoming],
            };
        }

        if (shouldKeepIncomingOverQueued(incoming)) {
            const replaceIndex = findReplaceableQueuedIndex(state.queue);
            if (replaceIndex !== -1) {
                const queue = [...state.queue];
                queue[replaceIndex] = incoming;
                return {
                    ...state,
                    queue,
                };
            }
        }

        return state;
    });
}

export function dismissActiveToast(id: number) {
    toastQueueStore.update((state) => {
        if (state.active?.id !== id) {
            return state;
        }

        const [next, ...queue] = state.queue;
        return {
            active: next ?? null,
            queue,
        };
    });
}

export function resetToastQueueForTest() {
    nextToastId = 1;
    toastQueueStore.set({
        active: null,
        queue: [],
    });
}
