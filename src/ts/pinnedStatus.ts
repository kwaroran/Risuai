import { writable } from "svelte/store";
import type { AlertSeverity } from "./alertModel";

export type PinnedStatusKind = 'token' | 'request' | 'sync' | 'storage' | 'ui';

export interface PinnedStatusInput {
    key: string;
    title: string;
    message?: string;
    value?: string;
    detail?: string;
    severity?: AlertSeverity;
    kind?: PinnedStatusKind;
    tokenInput?: number;
    tokenOutput?: number;
}

export interface PinnedStatusItem extends Required<Pick<PinnedStatusInput, 'key' | 'title' | 'severity' | 'kind'>> {
    message?: string;
    value?: string;
    detail?: string;
    tokenInput?: number;
    tokenOutput?: number;
    collapsed: boolean;
    createdAt: number;
    updatedAt: number;
}

export const pinnedStatusStore = writable<PinnedStatusItem[]>([]);

function createPinnedStatus(input: PinnedStatusInput): PinnedStatusItem {
    const now = Date.now();

    return {
        ...input,
        severity: input.severity ?? 'info',
        kind: input.kind ?? 'ui',
        collapsed: false,
        createdAt: now,
        updatedAt: now,
    };
}

export function setPinnedStatus(input: PinnedStatusInput) {
    pinnedStatusStore.update((items) => {
        const index = items.findIndex((item) => item.key === input.key);
        if (index === -1) {
            return [...items, createPinnedStatus(input)];
        }

        const item = items[index];
        const updated: PinnedStatusItem = {
            ...item,
            ...input,
            severity: input.severity ?? item.severity,
            kind: input.kind ?? item.kind,
            collapsed: item.collapsed,
            createdAt: item.createdAt,
            updatedAt: Date.now(),
        };

        return items.map((current, currentIndex) => currentIndex === index ? updated : current);
    });
}

export function updatePinnedStatus(key: string, patch: Partial<Omit<PinnedStatusInput, 'key'>>) {
    pinnedStatusStore.update((items) => items.map((item) => {
        if (item.key !== key) {
            return item;
        }

        return {
            ...item,
            ...patch,
            severity: patch.severity ?? item.severity,
            kind: patch.kind ?? item.kind,
            updatedAt: Date.now(),
        };
    }));
}

export function clearPinnedStatus(key: string) {
    pinnedStatusStore.update((items) => items.filter((item) => item.key !== key));
}

export function togglePinnedStatusCollapsed(key: string) {
    pinnedStatusStore.update((items) => items.map((item) => item.key === key ? {
        ...item,
        collapsed: !item.collapsed,
        updatedAt: Date.now(),
    } : item));
}

export function resetPinnedStatusForTest() {
    pinnedStatusStore.set([]);
}
