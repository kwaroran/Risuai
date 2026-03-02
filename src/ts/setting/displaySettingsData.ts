/**
 * Display Settings Data
 * 
 * Data-driven definition for DisplaySettings page.
 * Split into three separate arrays to match the tab structure.
 */

import type { SettingItem } from './types';
import { changeColorScheme, updateTextThemeAndCSS } from '../gui/colorscheme';
import { updateGuisize, guiSizeText } from '../gui/guisize';
import { updateAnimationSpeed } from '../gui/animation';
import { CustomGUISettingMenuStore } from '../stores.svelte';
import { changeFullscreen } from '../util';

// ==========================================
// 1. THEME TAB
// ==========================================
export const displayThemeItems: SettingItem[] = [
    {
        id: 'disp.theme',
        type: 'select',
        labelKey: 'theme',
        bindKey: 'theme',
        options: {
            selectOptions: [
                { value: '', label: 'Standard Risu' },
                { value: 'waifu', label: 'Waifulike' },
                { value: 'mobilechat', label: 'Mobile Chat' },
                { value: 'cardboard', label: 'CardBoard' },
                { value: 'customHTML', label: 'Custom HTML' },
                { value: 'custom', label: 'Custom' }
            ]
        },
        classes: 'mt-4'
    },
    {
        id: 'disp.defineCustomGUI',
        type: 'button',
        labelKey: 'defineCustomGUI',
        condition: (ctx) => ctx.db.theme === 'custom',
        options: {
            onClick: () => {
                CustomGUISettingMenuStore.set(true);
            }
        },
        classes: 'mt-2'
    },
    {
        id: 'disp.guiHTML',
        type: 'textarea',
        labelKey: 'chatHTML',
        bindKey: 'guiHTML',
        helpKey: 'chatHTML',
        condition: (ctx) => ctx.db.theme === 'customHTML',
        classes: 'mt-4'
    },
    {
        id: 'disp.waifuWidth',
        type: 'slider',
        labelKey: 'waifuWidth',
        bindKey: 'waifuWidth',
        condition: (ctx) => ctx.db.theme === 'waifu',
        options: { min: 50, max: 200, customTextFn: (val) => `${val}%` },
        classes: 'mt-4'
    },
    {
        id: 'disp.waifuWidth2',
        type: 'slider',
        labelKey: 'waifuWidth2',
        bindKey: 'waifuWidth2',
        condition: (ctx) => ctx.db.theme === 'waifu',
        options: { min: 20, max: 150, customTextFn: (val) => `${val}%` },
        classes: 'mt-4'
    },
    {
        id: 'disp.colorSchemeName',
        type: 'select',
        labelKey: 'colorScheme',
        bindKey: 'colorSchemeName',
        onChange: (value) => changeColorScheme(value),
        options: {
            selectOptions: [
                { value: 'default', label: 'default' },
                { value: 'dark', label: 'dark' },
                { value: 'light', label: 'light' },
                { value: 'cherry', label: 'cherry' },
                { value: 'galaxy', label: 'galaxy' },
                { value: 'nature', label: 'nature' },
                { value: 'realblack', label: 'realblack' },
                { value: 'monokai-light', label: 'monokai-light' },
                { value: 'monokai-black', label: 'monokai-black' },
                { value: 'lite', label: 'lite' },
                { value: 'custom', label: 'Custom' }
            ]
        },
        classes: 'mt-4'
    },
    {
        id: 'disp.customColorScheme',
        type: 'custom',
        componentId: 'CustomColorSchemeSettings',
        condition: (ctx) => ctx.db.colorSchemeName === 'custom'
    },
    {
        id: 'disp.textTheme',
        type: 'select',
        labelKey: 'textColor',
        bindKey: 'textTheme',
        onChange: () => updateTextThemeAndCSS(),
        options: {
            selectOptions: [
                { value: 'standard', labelKey: 'classicRisu' },
                { value: 'highcontrast', labelKey: 'highcontrast' },
                { value: 'custom', label: 'Custom' }
            ]
        },
        classes: 'mt-4'
    },
    {
        id: 'disp.customTextTheme',
        type: 'custom',
        componentId: 'CustomTextThemeSettings',
        condition: (ctx) => ctx.db.textTheme === 'custom'
    },
    {
        id: 'disp.font',
        type: 'select',
        labelKey: 'font',
        bindKey: 'font',
        onChange: () => updateTextThemeAndCSS(),
        options: {
            selectOptions: [
                { value: 'default', label: 'Default' },
                { value: 'timesnewroman', label: 'Times New Roman' },
                { value: 'custom', label: 'Custom' }
            ]
        },
        classes: 'mt-4'
    },
    {
        id: 'disp.customFont',
        type: 'text',
        fallbackLabel: 'Custom Font Name',
        bindKey: 'customFont',
        onChange: () => updateTextThemeAndCSS(),
        condition: (ctx) => ctx.db.font === 'custom'
    }
];

// ==========================================
// 2. SIZE & SPEED TAB
// ==========================================
export const displaySizeItems: SettingItem[] = [
    {
        id: 'disp.UISize',
        type: 'slider',
        labelKey: 'UISize',
        bindKey: 'zoomsize',
        options: { min: 50, max: 200 },
        classes: 'mt-4'
    },
    {
        id: 'disp.lineHeight',
        type: 'slider',
        labelKey: 'lineHeight',
        bindKey: 'lineHeight',
        options: { min: 0.5, max: 3, step: 0.05, fixed: 2 }
    },
    {
        id: 'disp.iconSize',
        type: 'slider',
        labelKey: 'iconSize',
        bindKey: 'iconsize',
        options: { min: 50, max: 200 }
    },
    {
        id: 'disp.textAreaSize',
        type: 'slider',
        labelKey: 'textAreaSize',
        bindKey: 'textAreaSize',
        onChange: () => updateGuisize(),
        options: { min: -5, max: 5, customTextFn: (val) => guiSizeText(val) }
    },
    {
        id: 'disp.textAreaTextSize',
        type: 'slider',
        labelKey: 'textAreaTextSize',
        bindKey: 'textAreaTextSize',
        onChange: () => updateGuisize(),
        options: { min: 0, max: 3, customTextFn: (val) => guiSizeText(val) }
    },
    {
        id: 'disp.sideBarSize',
        type: 'slider',
        labelKey: 'sideBarSize',
        bindKey: 'sideBarSize',
        onChange: () => updateGuisize(),
        options: { min: 0, max: 3, customTextFn: (val) => guiSizeText(val) }
    },
    {
        id: 'disp.assetWidth',
        type: 'slider',
        labelKey: 'assetWidth',
        bindKey: 'assetWidth',
        options: { 
            min: -1, 
            max: 40, 
            step: 1,
            customTextFn: (val) => val === -1 ? 'Unlimited' : val === 0 ? 'Hidden' : `${val.toFixed(1)} rem`
        }
    },
    {
        id: 'disp.animationSpeed',
        type: 'slider',
        labelKey: 'animationSpeed',
        bindKey: 'animationSpeed',
        onChange: () => updateAnimationSpeed(),
        options: { min: 0, max: 1, step: 0.05, fixed: 2 }
    },
    {
        id: 'disp.memoryLimitThickness',
        type: 'slider',
        labelKey: 'memoryLimitThickness',
        bindKey: 'memoryLimitThickness',
        condition: (ctx) => ctx.db.showMemoryLimit,
        options: { min: 1, max: 500, step: 1 }
    },
    {
        id: 'disp.settingsCloseButtonSize',
        type: 'slider',
        labelKey: 'settingsCloseButtonSize',
        helpKey: 'settingsCloseButtonSize',
        bindKey: 'settingsCloseButtonSize',
        options: { min: 16, max: 48, step: 1 }
    }
];

// ==========================================
// 3. OTHERS TAB
// ==========================================
export const displayOthersItems: SettingItem[] = [
    { id: 'disp.fullScreen', type: 'check', labelKey: 'fullscreen', bindKey: 'fullScreen', onChange: () => changeFullscreen() },
    { id: 'disp.showMemoryLimit', type: 'check', labelKey: 'showMemoryLimit', bindKey: 'showMemoryLimit' },
    { id: 'disp.showFirstMessagePages', type: 'check', labelKey: 'showFirstMessagePages', bindKey: 'showFirstMessagePages' },
    { id: 'disp.hideRealm', type: 'check', labelKey: 'hideRealm', bindKey: 'hideRealm' },
    { id: 'disp.hideAllImages', type: 'check', labelKey: 'hideAllImages', bindKey: 'hideAllImages', helpKey: 'hideAllImagesDesc' },
    { id: 'disp.showFolderNameInIcon', type: 'check', labelKey: 'showFolderNameInIcon', bindKey: 'showFolderName' },
    { id: 'disp.customBackgroundSetting', type: 'custom', componentId: 'CustomBackgroundSetting' },
    { id: 'disp.playMessage', type: 'check', labelKey: 'playMessage', bindKey: 'playMessage', helpKey: 'msgSound' }, // help has specific needs in actual code, might need a tweak in SettingRenderer later if label mismatch
    { id: 'disp.playMessageOnTranslateEnd', type: 'check', labelKey: 'playMessageOnTranslateEnd', bindKey: 'playMessageOnTranslateEnd' },
    { id: 'disp.roundIcons', type: 'check', labelKey: 'roundIcons', bindKey: 'roundIcons' },
    
    // Toggleable Colors
    { id: 'disp.textScreenColor', type: 'custom', componentId: 'ToggleableColorSettings', componentProps: { bindKey: 'textScreenColor', labelKey: 'textBackgrounds' } },
    { id: 'disp.textBorder', type: 'check', labelKey: 'textBorder', bindKey: 'textBorder' },
    { id: 'disp.textScreenRound', type: 'check', labelKey: 'textScreenRound', bindKey: 'textScreenRounded' },
    { id: 'disp.showSavingIcon', type: 'check', labelKey: 'showSavingIcon', bindKey: 'showSavingIcon' },
    { id: 'disp.showPromptComparison', type: 'check', labelKey: 'showPromptComparison', bindKey: 'showPromptComparison' },
    { id: 'disp.textScreenBorder', type: 'custom', componentId: 'ToggleableColorSettings', componentProps: { bindKey: 'textScreenBorder', labelKey: 'textScreenBorder' } },

    { id: 'disp.useChatCopy', type: 'check', labelKey: 'useChatCopy', bindKey: 'useChatCopy' },
    { id: 'disp.useAdditionalAssetsPreview', type: 'check', labelKey: 'useAdditionalAssetsPreview', bindKey: 'useAdditionalAssetsPreview' },
    { id: 'disp.useLegacyGUI', type: 'check', labelKey: 'useLegacyGUI', bindKey: 'useLegacyGUI' },
    { id: 'disp.hideApiKeys', type: 'check', labelKey: 'hideApiKeys', bindKey: 'hideApiKey' },
    { id: 'disp.unformatQuotes', type: 'check', labelKey: 'unformatQuotes', bindKey: 'unformatQuotes' },
    { id: 'disp.blockquoteStyling', type: 'check', labelKey: 'blockquoteStyling', bindKey: 'blockquoteStyling' },
    { id: 'disp.customQuotes', type: 'check', labelKey: 'customQuotes', bindKey: 'customQuotes' },
    { id: 'disp.customQuotesData', type: 'custom', componentId: 'CustomQuotesSettings', condition: (ctx) => ctx.db.customQuotes },
    { id: 'disp.betaMobileGUI', type: 'check', labelKey: 'betaMobileGUI', bindKey: 'betaMobileGUI', helpKey: 'betaMobileGUI' },
    { id: 'disp.menuSideBar', type: 'check', labelKey: 'menuSideBar', bindKey: 'menuSideBar' },
    { id: 'disp.notification', type: 'custom', componentId: 'NotificationSetting' },
    { id: 'disp.useChatSticker', type: 'check', labelKey: 'useChatSticker', bindKey: 'useChatSticker', condition: (ctx) => ctx.db.showUnrecommended, helpKey: 'unrecommended', helpUnrecommended: true },
    
    { id: 'disp.customCSS', type: 'textarea', labelKey: 'customCSS', bindKey: 'customCSS', helpKey: 'customCSS', onChange: () => updateTextThemeAndCSS(), classes: 'mt-4' }
];
