/**
 * Custom Component Registry
 * 
 * Maps component IDs (strings) to actual Svelte components.
 * This enables the data-driven settings structure to reference
 * complex components without circular import issues.
 * 
 * Usage in settings data:
 *   { type: 'custom', componentId: 'ModelSelector' }
 * 
 * The SettingRenderer will look up the component from this registry
 * and render it dynamically.
 */

import type { Component } from 'svelte';

// Import custom components here
import SeparateParametersSection from 'src/lib/Setting/Pages/SeparateParametersSection.svelte';
import BanCharacterSetSettings from 'src/lib/Setting/Pages/Advanced/BanCharacterSetSettings.svelte';
import CustomModelsSettings from 'src/lib/Setting/Pages/Advanced/CustomModelsSettings.svelte';
import SettingsExportButtons from 'src/lib/Setting/Pages/Advanced/SettingsExportButtons.svelte';

import CustomColorSchemeSettings from 'src/lib/Setting/Pages/Display/CustomColorSchemeSettings.svelte';
import CustomTextThemeSettings from 'src/lib/Setting/Pages/Display/CustomTextThemeSettings.svelte';
import ToggleableColorSettings from 'src/lib/Setting/Pages/Display/ToggleableColorSettings.svelte';
import CustomBackgroundSetting from 'src/lib/Setting/Pages/Display/CustomBackgroundSetting.svelte';
import NotificationSetting from 'src/lib/Setting/Pages/Display/NotificationSetting.svelte';
import CustomQuotesSettings from 'src/lib/Setting/Pages/Display/CustomQuotesSettings.svelte';

/**
 * Registry of custom components.
 * Add new components here as needed.
 */
export const customComponents: Record<string, Component<any>> = {
    'SeparateParametersSection': SeparateParametersSection,
    'BanCharacterSetSettings': BanCharacterSetSettings,
    'CustomModelsSettings': CustomModelsSettings,
    'SettingsExportButtons': SettingsExportButtons,
    'CustomColorSchemeSettings': CustomColorSchemeSettings,
    'CustomTextThemeSettings': CustomTextThemeSettings,
    'ToggleableColorSettings': ToggleableColorSettings,
    'CustomBackgroundSetting': CustomBackgroundSetting,
    'NotificationSetting': NotificationSetting,
    'CustomQuotesSettings': CustomQuotesSettings,
    // Add more as we migrate complex settings
} as const;

/**
 * Type-safe component ID type.
 * Will be populated as components are added to the registry.
 */
export type CustomComponentId = keyof typeof customComponents;

/**
 * Props that can be passed to custom components
 */
export interface CustomComponentProps {
    /** Any additional props to pass to the component */
    [key: string]: unknown;
}
