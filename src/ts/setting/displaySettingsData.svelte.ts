/**
 * Display Settings Data
 *
 * Data-driven definition for DisplaySettings page.
 */

import type { SettingItem } from './types';

export const displayThemeSettingsItems: SettingItem[] = [];

export const displaySizeSettingsItems: SettingItem[] = [];

export const displayOtherSettingsItems: SettingItem[] = [];

export const displaySettingsItems: SettingItem[] = [
    ...displayThemeSettingsItems,
    ...displaySizeSettingsItems,
    ...displayOtherSettingsItems,
];
