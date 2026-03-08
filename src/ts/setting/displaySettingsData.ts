import type { SettingItem } from './types';
import { guiSizeText, updateGuisize } from 'src/ts/gui/guisize';
import { updateAnimationSpeed } from 'src/ts/gui/animation';
import { updateTextThemeAndCSS } from 'src/ts/gui/colorscheme';
import { changeFullscreen } from 'src/ts/util';
import { CustomGUISettingMenuStore } from 'src/ts/stores.svelte';

// ── Theme Tab (submenu 0) ────────────────────────────────────────────

const displayThemeItems: SettingItem[] = [
    {
        type: 'select',
        id: 'disp.theme',
        labelKey: 'theme',
        getValue: (db) => db.theme,
        setValue: (db, v) => { db.theme = v; },
        options: {
            selectOptions: [
                { value: '', label: 'Standard Risu' },
                { value: 'waifu', label: 'Waifulike' },
                { value: 'mobilechat', label: 'Mobile Chat' },
                { value: 'cardboard', label: 'CardBoard' },
                { value: 'customHTML', label: 'Custom HTML' },
            ],
        },
    },
    {
        type: 'button',
        id: 'disp.defineCustomGUI',
        labelKey: 'defineCustomGUI',
        condition: (ctx) => ctx.db.theme === 'custom',
        options: {
            onClick: () => { CustomGUISettingMenuStore.set(true); },
        },
    },
    {
        type: 'textarea',
        id: 'disp.chatHTML',
        labelKey: 'chatHTML',
        helpKey: 'chatHTML',
        condition: (ctx) => ctx.db.theme === 'customHTML',
        getValue: (db) => db.guiHTML,
        setValue: (db, v) => { db.guiHTML = v; },
    },
    {
        type: 'slider',
        id: 'disp.waifuWidth',
        labelKey: 'waifuWidth',
        condition: (ctx) => ctx.db.theme === 'waifu',
        getValue: (db) => db.waifuWidth,
        setValue: (db, v) => { db.waifuWidth = v; },
        options: { min: 50, max: 200 },
    },
    {
        type: 'slider',
        id: 'disp.waifuWidth2',
        labelKey: 'waifuWidth2',
        condition: (ctx) => ctx.db.theme === 'waifu',
        getValue: (db) => db.waifuWidth2,
        setValue: (db, v) => { db.waifuWidth2 = v; },
        options: { min: 20, max: 150 },
    },
    {
        type: 'custom',
        id: 'disp.colorSchemeEditor',
        componentId: 'DisplayColorSchemeEditor',
    },
    {
        type: 'select',
        id: 'disp.textColor',
        labelKey: 'textColor',
        getValue: (db) => db.textTheme,
        setValue: (db, v) => { db.textTheme = v; },
        onChange: () => { updateTextThemeAndCSS(); },
        options: {
            selectOptions: [
                { value: 'standard', labelKey: 'classicRisu' },
                { value: 'highcontrast', labelKey: 'highcontrast' },
                { value: 'custom', label: 'Custom' },
            ],
        },
    },
    {
        type: 'custom',
        id: 'disp.customTextTheme',
        componentId: 'DisplayCustomTextTheme',
    },
    {
        type: 'select',
        id: 'disp.font',
        labelKey: 'font',
        getValue: (db) => db.font,
        setValue: (db, v) => { db.font = v; },
        onChange: () => { updateTextThemeAndCSS(); },
        options: {
            selectOptions: [
                { value: 'default', label: 'Default' },
                { value: 'timesnewroman', label: 'Times New Roman' },
                { value: 'custom', label: 'Custom' },
            ],
        },
    },
    {
        type: 'text',
        id: 'disp.customFont',
        condition: (ctx) => ctx.db.font === 'custom',
        getValue: (db) => db.customFont,
        setValue: (db, v) => { db.customFont = v; },
        onChange: () => { updateTextThemeAndCSS(); },
    },
];

// ── Size & Speed Tab (submenu 1) ─────────────────────────────────────

const displaySizeItems: SettingItem[] = [
    {
        type: 'slider',
        id: 'disp.uiSize',
        labelKey: 'UISize',
        getValue: (db) => db.zoomsize,
        setValue: (db, v) => { db.zoomsize = v; },
        options: { min: 50, max: 200 },
    },
    {
        type: 'slider',
        id: 'disp.lineHeight',
        labelKey: 'lineHeight',
        getValue: (db) => db.lineHeight,
        setValue: (db, v) => { db.lineHeight = v; },
        options: { min: 0.5, max: 3, step: 0.05, fixed: 2 },
    },
    {
        type: 'slider',
        id: 'disp.iconSize',
        labelKey: 'iconSize',
        getValue: (db) => db.iconsize,
        setValue: (db, v) => { db.iconsize = v; },
        options: { min: 50, max: 200 },
    },
    {
        type: 'slider',
        id: 'disp.textAreaSize',
        labelKey: 'textAreaSize',
        getValue: (db) => db.textAreaSize,
        setValue: (db, v) => { db.textAreaSize = v; },
        onChange: () => { updateGuisize(); },
        options: {
            min: -5, max: 5,
            customTextFn: (value: number) => guiSizeText(value),
        },
    },
    {
        type: 'slider',
        id: 'disp.textAreaTextSize',
        labelKey: 'textAreaTextSize',
        getValue: (db) => db.textAreaTextSize,
        setValue: (db, v) => { db.textAreaTextSize = v; },
        onChange: () => { updateGuisize(); },
        options: {
            min: 0, max: 3,
            customTextFn: (value: number) => guiSizeText(value),
        },
    },
    {
        type: 'slider',
        id: 'disp.sideBarSize',
        labelKey: 'sideBarSize',
        getValue: (db) => db.sideBarSize,
        setValue: (db, v) => { db.sideBarSize = v; },
        onChange: () => { updateGuisize(); },
        options: {
            min: 0, max: 3,
            customTextFn: (value: number) => guiSizeText(value),
        },
    },
    {
        type: 'slider',
        id: 'disp.assetWidth',
        labelKey: 'assetWidth',
        getValue: (db) => db.assetWidth,
        setValue: (db, v) => { db.assetWidth = v; },
        options: {
            min: -1, max: 40, step: 1,
            customTextFn: (value: number) =>
                value === -1 ? 'Unlimited' :
                value === 0 ? 'Hidden' :
                `${value.toFixed(1)} rem`,
        },
    },
    {
        type: 'slider',
        id: 'disp.animationSpeed',
        labelKey: 'animationSpeed',
        getValue: (db) => db.animationSpeed,
        setValue: (db, v) => { db.animationSpeed = v; },
        onChange: () => { updateAnimationSpeed(); },
        options: { min: 0, max: 1, step: 0.05, fixed: 2 },
    },
    {
        type: 'slider',
        id: 'disp.memoryLimitThickness',
        labelKey: 'memoryLimitThickness',
        condition: (ctx) => ctx.db.showMemoryLimit,
        getValue: (db) => db.memoryLimitThickness,
        setValue: (db, v) => { db.memoryLimitThickness = v; },
        options: { min: 1, max: 500, step: 1 },
    },
    {
        type: 'slider',
        id: 'disp.settingsCloseButtonSize',
        labelKey: 'settingsCloseButtonSize',
        helpKey: 'settingsCloseButtonSize',
        getValue: (db) => db.settingsCloseButtonSize,
        setValue: (db, v) => { db.settingsCloseButtonSize = v; },
        options: { min: 16, max: 48, step: 1 },
    },
];

// ── Others Tab (submenu 2) ───────────────────────────────────────────

const displayOthersItems: SettingItem[] = [
    {
        type: 'check',
        id: 'disp.fullscreen',
        labelKey: 'fullscreen',
        getValue: (db) => db.fullScreen,
        setValue: (db, v) => { db.fullScreen = v; },
        onChange: () => { changeFullscreen(); },
    },
    {
        type: 'check',
        id: 'disp.showMemoryLimit',
        labelKey: 'showMemoryLimit',
        getValue: (db) => db.showMemoryLimit,
        setValue: (db, v) => { db.showMemoryLimit = v; },
    },
    {
        type: 'check',
        id: 'disp.showFirstMessagePages',
        labelKey: 'showFirstMessagePages',
        getValue: (db) => db.showFirstMessagePages,
        setValue: (db, v) => { db.showFirstMessagePages = v; },
    },
    {
        type: 'check',
        id: 'disp.hideRealm',
        labelKey: 'hideRealm',
        getValue: (db) => db.hideRealm,
        setValue: (db, v) => { db.hideRealm = v; },
    },
    {
        type: 'check',
        id: 'disp.hideAllImages',
        labelKey: 'hideAllImages',
        helpKey: 'hideAllImagesDesc',
        getValue: (db) => db.hideAllImages,
        setValue: (db, v) => { db.hideAllImages = v; },
    },
    {
        type: 'check',
        id: 'disp.showFolderName',
        labelKey: 'showFolderNameInIcon',
        getValue: (db) => db.showFolderName,
        setValue: (db, v) => { db.showFolderName = v; },
    },
    {
        type: 'custom',
        id: 'disp.customBackground',
        componentId: 'DisplayCustomBackground',
    },
    {
        type: 'check',
        id: 'disp.playMessage',
        labelKey: 'playMessage',
        helpKey: 'msgSound',
        getValue: (db) => db.playMessage,
        setValue: (db, v) => { db.playMessage = v; },
    },
    {
        type: 'check',
        id: 'disp.playMessageOnTranslateEnd',
        labelKey: 'playMessageOnTranslateEnd',
        getValue: (db) => db.playMessageOnTranslateEnd,
        setValue: (db, v) => { db.playMessageOnTranslateEnd = v; },
    },
    {
        type: 'check',
        id: 'disp.roundIcons',
        labelKey: 'roundIcons',
        getValue: (db) => db.roundIcons,
        setValue: (db, v) => { db.roundIcons = v; },
    },
    {
        type: 'custom',
        id: 'disp.textScreenColor',
        componentId: 'DisplayTextScreenColor',
    },
    {
        type: 'check',
        id: 'disp.textBorder',
        labelKey: 'textBorder',
        getValue: (db) => db.textBorder,
        setValue: (db, v) => { db.textBorder = v; },
    },
    {
        type: 'check',
        id: 'disp.textScreenRounded',
        labelKey: 'textScreenRound',
        getValue: (db) => db.textScreenRounded,
        setValue: (db, v) => { db.textScreenRounded = v; },
    },
    {
        type: 'check',
        id: 'disp.showSavingIcon',
        labelKey: 'showSavingIcon',
        getValue: (db) => db.showSavingIcon,
        setValue: (db, v) => { db.showSavingIcon = v; },
    },
    {
        type: 'check',
        id: 'disp.showPromptComparison',
        labelKey: 'showPromptComparison',
        getValue: (db) => db.showPromptComparison,
        setValue: (db, v) => { db.showPromptComparison = v; },
    },
    {
        type: 'custom',
        id: 'disp.textScreenBorder',
        componentId: 'DisplayTextScreenBorder',
    },
    {
        type: 'check',
        id: 'disp.useChatCopy',
        labelKey: 'useChatCopy',
        getValue: (db) => db.useChatCopy,
        setValue: (db, v) => { db.useChatCopy = v; },
    },
    {
        type: 'check',
        id: 'disp.useAdditionalAssetsPreview',
        labelKey: 'useAdditionalAssetsPreview',
        getValue: (db) => db.useAdditionalAssetsPreview,
        setValue: (db, v) => { db.useAdditionalAssetsPreview = v; },
    },
    {
        type: 'check',
        id: 'disp.useLegacyGUI',
        labelKey: 'useLegacyGUI',
        getValue: (db) => db.useLegacyGUI,
        setValue: (db, v) => { db.useLegacyGUI = v; },
    },
    {
        type: 'check',
        id: 'disp.hideApiKey',
        labelKey: 'hideApiKeys',
        getValue: (db) => db.hideApiKey,
        setValue: (db, v) => { db.hideApiKey = v; },
    },
    {
        type: 'check',
        id: 'disp.unformatQuotes',
        labelKey: 'unformatQuotes',
        getValue: (db) => db.unformatQuotes,
        setValue: (db, v) => { db.unformatQuotes = v; },
    },
    {
        type: 'check',
        id: 'disp.blockquoteStyling',
        labelKey: 'blockquoteStyling',
        getValue: (db) => db.blockquoteStyling,
        setValue: (db, v) => { db.blockquoteStyling = v; },
    },
    {
        type: 'check',
        id: 'disp.customQuotes',
        labelKey: 'customQuotes',
        getValue: (db) => db.customQuotes,
        setValue: (db, v) => { db.customQuotes = v; },
    },
    {
        type: 'text',
        id: 'disp.leadingDoubleQuote',
        labelKey: 'leadingDoubleQuote',
        condition: (ctx) => ctx.db.customQuotes,
        getValue: (db) => db.customQuotesData[0],
        setValue: (db, v) => { db.customQuotesData[0] = v; },
    },
    {
        type: 'text',
        id: 'disp.trailingDoubleQuote',
        labelKey: 'trailingDoubleQuote',
        condition: (ctx) => ctx.db.customQuotes,
        getValue: (db) => db.customQuotesData[1],
        setValue: (db, v) => { db.customQuotesData[1] = v; },
    },
    {
        type: 'text',
        id: 'disp.leadingSingleQuote',
        labelKey: 'leadingSingleQuote',
        condition: (ctx) => ctx.db.customQuotes,
        getValue: (db) => db.customQuotesData[2],
        setValue: (db, v) => { db.customQuotesData[2] = v; },
    },
    {
        type: 'text',
        id: 'disp.trailingSingleQuote',
        labelKey: 'trailingSingleQuote',
        condition: (ctx) => ctx.db.customQuotes,
        getValue: (db) => db.customQuotesData[3],
        setValue: (db, v) => { db.customQuotesData[3] = v; },
    },
    {
        type: 'check',
        id: 'disp.betaMobileGUI',
        labelKey: 'betaMobileGUI',
        helpKey: 'betaMobileGUI',
        getValue: (db) => db.betaMobileGUI,
        setValue: (db, v) => { db.betaMobileGUI = v; },
    },
    {
        type: 'check',
        id: 'disp.menuSideBar',
        labelKey: 'menuSideBar',
        getValue: (db) => db.menuSideBar,
        setValue: (db, v) => { db.menuSideBar = v; },
    },
    {
        type: 'custom',
        id: 'disp.notification',
        componentId: 'DisplayNotification',
    },
    {
        type: 'check',
        id: 'disp.useChatSticker',
        labelKey: 'useChatSticker',
        helpKey: 'unrecommended',
        helpUnrecommended: true,
        condition: (ctx) => ctx.db.showUnrecommended,
        getValue: (db) => db.useChatSticker,
        setValue: (db, v) => { db.useChatSticker = v; },
    },
    {
        type: 'textarea',
        id: 'disp.customCSS',
        labelKey: 'customCSS',
        helpKey: 'customCSS',
        getValue: (db) => db.customCSS,
        setValue: (db, v) => { db.customCSS = v; },
        onChange: () => { updateTextThemeAndCSS(); },
    },
];

// ── Exported: Full display settings with tabs ────────────────────────

export const displaySettingsItems: SettingItem[] = [
    {
        type: 'header',
        id: 'disp.header',
        labelKey: 'display',
        options: { level: 'h2' },
    },
    {
        type: 'tabs',
        id: 'disp.tabs',
        options: {
            tabs: [
                { labelKey: 'theme', children: displayThemeItems },
                { labelKey: 'sizeAndSpeed', children: displaySizeItems },
                { labelKey: 'others', children: displayOthersItems },
            ],
        },
    },
];
