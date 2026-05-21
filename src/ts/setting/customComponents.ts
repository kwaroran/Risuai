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
import TranslatorPresetSettings from 'src/lib/Setting/Pages/Language/TranslatorPresetSettings.svelte';
import BanCharacterSetSettings from 'src/lib/Setting/Pages/Advanced/BanCharacterSetSettings.svelte';
import CustomModelsSettings from 'src/lib/Setting/Pages/Advanced/CustomModelsSettings.svelte';
import SettingsExportButtons from 'src/lib/Setting/Pages/Advanced/SettingsExportButtons.svelte';
import CustomSidebarConfigButton from 'src/lib/Setting/Pages/Advanced/CustomSidebarConfigButton.svelte';
import ColorSchemeSelect from 'src/lib/Setting/Pages/Display/ColorSchemeSelect.svelte';
import CustomColorSchemeEditor from 'src/lib/Setting/Pages/Display/CustomColorSchemeEditor.svelte';
import CustomTextThemeEditor from 'src/lib/Setting/Pages/Display/CustomTextThemeEditor.svelte';
import CustomBackgroundToggle from 'src/lib/Setting/Pages/Display/CustomBackgroundToggle.svelte';
import NullableTextColorToggle from 'src/lib/Setting/Pages/Display/NullableTextColorToggle.svelte';
import NotificationToggle from 'src/lib/Setting/Pages/Display/NotificationToggle.svelte';

/**
 * Registry of custom components.
 * Add new components here as needed.
 */
export const customComponents: Record<string, Component<any>> = {
    'SeparateParametersSection': SeparateParametersSection,
    'TranslatorPresetSettings': TranslatorPresetSettings,
    'BanCharacterSetSettings': BanCharacterSetSettings,
    'CustomModelsSettings': CustomModelsSettings,
    'SettingsExportButtons': SettingsExportButtons,
    'CustomSidebarConfig': CustomSidebarConfigButton,
    'ColorSchemeSelect': ColorSchemeSelect,
    'CustomColorSchemeEditor': CustomColorSchemeEditor,
    'CustomTextThemeEditor': CustomTextThemeEditor,
    'CustomBackgroundToggle': CustomBackgroundToggle,
    'NullableTextColorToggle': NullableTextColorToggle,
    'NotificationToggle': NotificationToggle,
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
