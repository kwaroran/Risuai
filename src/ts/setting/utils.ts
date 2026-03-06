import type { SettingItem, SettingContext } from './types';
import { DBState } from '../stores.svelte';
import { language } from 'src/lang';

/**
 * Sentinel value representing an uninitialized local state in wrapper components.
 * Used instead of `undefined` so that a legitimate `undefined` DB value
 * can still be written back without being silently ignored.
 */
export const UNINITIALIZED = Symbol('uninitialized');

export function getLabel(item: SettingItem): string {
    if (item.labelKey && (language as any)[item.labelKey]) {
        return (language as any)[item.labelKey];
    }
    return item.fallbackLabel ?? '';
}

export function getSettingValue(item: SettingItem, ctx: SettingContext): any {
    if (item.getValue) {
        return item.getValue(DBState.db, ctx);
    }
    if (item.bindPath) {
        const parts = item.bindPath.split('.');
        let value: any = DBState.db;
        for (const part of parts) {
            value = value?.[part];
        }
        return value;
    }
    if (item.bindKey) {
        return (DBState.db as any)[item.bindKey];
    }
    return undefined;
}

export function setSettingValue(item: SettingItem, newValue: any, ctx: SettingContext): void {
    if (item.setValue) {
        item.setValue(DBState.db, newValue, ctx);
    } else if (item.bindPath) {
        const parts = item.bindPath.split('.');
        let obj: any = DBState.db;
        for (let i = 0; i < parts.length - 1; i++) {
            obj = obj[parts[i]] ??= {};
        }
        obj[parts[parts.length - 1]] = newValue;
    } else if (item.bindKey) {
        (DBState.db as any)[item.bindKey] = newValue;
    }
    
    if (item.onChange) {
        item.onChange(newValue, ctx);
    }
}

/**
 * Check if item should be visible based on condition
 */
export function checkCondition(item: SettingItem, ctx: SettingContext): boolean {
    if (!item.condition) return true;
    return item.condition(ctx);
}
