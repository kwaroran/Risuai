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
import DisplayColorSchemeEditor from 'src/lib/Setting/Pages/Display/DisplayColorSchemeEditor.svelte';
import DisplayCustomTextTheme from 'src/lib/Setting/Pages/Display/DisplayCustomTextTheme.svelte';
import DisplayCustomBackground from 'src/lib/Setting/Pages/Display/DisplayCustomBackground.svelte';
import DisplayTextScreenColor from 'src/lib/Setting/Pages/Display/DisplayTextScreenColor.svelte';
import DisplayTextScreenBorder from 'src/lib/Setting/Pages/Display/DisplayTextScreenBorder.svelte';
import DisplayNotification from 'src/lib/Setting/Pages/Display/DisplayNotification.svelte';

/**
 * Registry of custom components.
 * Add new components here as needed.
 */
export const customComponents: Record<string, Component<any>> = {
    'SeparateParametersSection': SeparateParametersSection,
    'BanCharacterSetSettings': BanCharacterSetSettings,
    'CustomModelsSettings': CustomModelsSettings,
    'SettingsExportButtons': SettingsExportButtons,
    'DisplayColorSchemeEditor': DisplayColorSchemeEditor,
    'DisplayCustomTextTheme': DisplayCustomTextTheme,
    'DisplayCustomBackground': DisplayCustomBackground,
    'DisplayTextScreenColor': DisplayTextScreenColor,
    'DisplayTextScreenBorder': DisplayTextScreenBorder,
    'DisplayNotification': DisplayNotification,
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
