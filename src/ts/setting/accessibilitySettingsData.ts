/**
 * Accessibility Settings Data
 * 
 * Data-driven definition of all settings in AccessibilitySettings page.
 */

import type { SettingItem } from './types';
import { language } from "src/lang";

export const accessibilitySettingsItems: SettingItem[] = [
    // Header
    {
        id: 'acc.header',
        type: 'header',
        labelKey: 'accessibility',
        options: { level: 'h2' }
    },
    
    // Checkboxes
    {
        id: 'acc.askRemoval',
        type: 'check',
        labelKey: 'askRemoval',
        getValue: (db) => db.askRemoval,
        setValue: (db, val) => db.askRemoval = val,
        keywords: ['ask', 'removal', 'confirm', 'delete']
    },
    {
        id: 'acc.swipe',
        type: 'check',
        labelKey: 'SwipeRegenerate',
        getValue: (db) => db.swipe,
        setValue: (db, val) => db.swipe = val,
        keywords: ['swipe', 'regenerate', 'gesture']
    },
    {
        id: 'acc.instantRemove',
        type: 'check',
        labelKey: 'instantRemove',
        getValue: (db) => db.instantRemove,
        setValue: (db, val) => db.instantRemove = val,
        keywords: ['instant', 'remove', 'delete']
    },
    {
        id: 'acc.sendWithEnter',
        type: 'check',
        labelKey: 'sendWithEnter',
        getValue: (db) => db.sendWithEnter,
        setValue: (db, val) => db.sendWithEnter = val,
        keywords: ['send', 'enter', 'keyboard', 'submit']
    },
    {
        id: 'acc.fixedChatTextarea',
        type: 'check',
        labelKey: 'fixedChatTextarea',
        getValue: (db) => db.fixedChatTextarea,
        setValue: (db, val) => db.fixedChatTextarea = val,
        keywords: ['fixed', 'chat', 'textarea', 'input']
    },
    {
        id: 'acc.clickToEdit',
        type: 'check',
        labelKey: 'clickToEdit',
        getValue: (db) => db.clickToEdit,
        setValue: (db, val) => db.clickToEdit = val,
        keywords: ['click', 'edit', 'message']
    },
    {
        id: 'acc.enableBlockPartialEdit',
        type: 'check',
        labelKey: 'enableBlockPartialEdit',
        getValue: (db) => db.enableBlockPartialEdit,
        setValue: (db, val) => db.enableBlockPartialEdit = val,
        keywords: ['partial', 'edit', 'block', 'hover']
    },
    {
        id: 'acc.enableDragPartialEdit',
        type: 'check',
        labelKey: 'enableDragPartialEdit',
        getValue: (db) => db.enableDragPartialEdit,
        setValue: (db, val) => db.enableDragPartialEdit = val,
        keywords: ['partial', 'edit', 'drag', 'selection']
    },
    {
        id: 'acc.botSettingAtStart',
        type: 'check',
        labelKey: 'botSettingAtStart',
        getValue: (db) => db.botSettingAtStart,
        setValue: (db, val) => db.botSettingAtStart = val,
        keywords: ['bot', 'setting', 'start', 'open']
    },
    {
        id: 'acc.showMenuChatList',
        type: 'check',
        labelKey: 'showMenuChatList',
        getValue: (db) => db.showMenuChatList,
        setValue: (db, val) => db.showMenuChatList = val,
        keywords: ['menu', 'chat', 'list', 'show']
    },
    {
        id: 'acc.showMenuHypaMemoryModal',
        type: 'check',
        labelKey: 'showMenuHypaMemoryModal',
        getValue: (db) => db.showMenuHypaMemoryModal,
        setValue: (db, val) => db.showMenuHypaMemoryModal = val,
        keywords: ['menu', 'hypa', 'memory', 'modal']
    },
    {
        id: 'acc.goCharacterOnImport',
        type: 'check',
        labelKey: 'goCharacterOnImport',
        getValue: (db) => db.goCharacterOnImport,
        setValue: (db, val) => db.goCharacterOnImport = val,
        keywords: ['character', 'import', 'navigate']
    },
    {
        id: 'acc.sideMenuRerollButton',
        type: 'check',
        labelKey: 'sideMenuRerollButton',
        getValue: (db) => db.sideMenuRerollButton,
        setValue: (db, val) => db.sideMenuRerollButton = val,
        keywords: ['side', 'menu', 'reroll', 'button']
    },
    {
        id: 'acc.localActivationInGlobalLorebook',
        type: 'check',
        labelKey: 'localActivationInGlobalLorebook',
        getValue: (db) => db.localActivationInGlobalLorebook,
        setValue: (db, val) => db.localActivationInGlobalLorebook = val,
        keywords: ['local', 'activation', 'global', 'lorebook']
    },
    {
        id: 'acc.requestInfoInsideChat',
        type: 'check',
        labelKey: 'requestInfoInsideChat',
        getValue: (db) => db.requestInfoInsideChat,
        setValue: (db, val) => db.requestInfoInsideChat = val,
        keywords: ['request', 'info', 'chat']
    },
    {
        id: 'acc.inlayErrorResponse',
        type: 'check',
        labelKey: 'inlayErrorResponse',
        getValue: (db) => db.inlayErrorResponse,
        setValue: (db, val) => db.inlayErrorResponse = val,
        keywords: ['inlay', 'error', 'response']
    },
    {
        id: 'acc.bulkEnabling',
        type: 'check',
        labelKey: 'bulkEnabling',
        getValue: (db) => db.bulkEnabling,
        setValue: (db, val) => db.bulkEnabling = val,
        keywords: ['bulk', 'enable', 'multiple']
    },
    {
        id: 'acc.showTranslationLoading',
        type: 'check',
        labelKey: 'showTranslationLoading',
        getValue: (db) => db.showTranslationLoading,
        setValue: (db, val) => db.showTranslationLoading = val,
        keywords: ['translation', 'loading', 'indicator']
    },
    {
        id: 'acc.autoScrollToNewMessage',
        type: 'check',
        labelKey: 'autoScrollToNewMessage',
        getValue: (db) => db.autoScrollToNewMessage,
        setValue: (db, val) => db.autoScrollToNewMessage = val,
        keywords: ['auto', 'scroll', 'new', 'message']
    },
    {
        id: 'acc.alwaysScrollToNewMessage',
        type: 'check',
        labelKey: 'alwaysScrollToNewMessage',
        getValue: (db) => db.alwaysScrollToNewMessage,
        setValue: (db, val) => db.alwaysScrollToNewMessage = val,
        condition: (ctx) => ctx.db.autoScrollToNewMessage,
        keywords: ['always', 'scroll', 'new', 'message']
    },
    {
        id: 'acc.newMessageButtonStyle',
        type: 'select',
        labelKey: 'newMessageButtonStyle',
        getValue: (db) => db.newMessageButtonStyle,
        setValue: (db, val) => db.newMessageButtonStyle = val,
        condition: (ctx) => ctx.db.autoScrollToNewMessage && !ctx.db.alwaysScrollToNewMessage,
        options: {
            selectOptions: [
                { value: 'bottom-center', label: language.newMessageButtonBottomCenter },
                { value: 'bottom-right', label: language.newMessageButtonBottomRight },
                { value: 'bottom-left', label: language.newMessageButtonBottomLeft },
                { value: 'floating-circle', label: language.newMessageButtonFloatingCircle },
                { value: 'right-center', label: language.newMessageButtonRightCenter },
                { value: 'top-bar', label: language.newMessageButtonTopBar }
            ]
        }
    },
    {
        id: 'acc.createFolderOnBranch',
        type: 'check',
        labelKey: 'createFolderOnBranch',
        getValue: (db) => db.createFolderOnBranch,
        setValue: (db, val) => db.createFolderOnBranch = val,
        keywords: ['create', 'folder', 'branch'],
    },
    {
        id: 'acc.hamburgerButtonBottom',
        type: 'check',
        labelKey: 'hamburgerButtonBottom',
        getValue: (db) => db.hamburgerButtonBottom,
        setValue: (db, val) => db.hamburgerButtonBottom = val,
        keywords: ['hamburger', 'button', 'bottom', 'menu', 'sidebar', 'accessibility'],
    },
    {
        id: 'acc.enableRisuaiProTools',
        type: 'check',
        labelKey: 'enableRisuaiProTools',
        getValue: (db) => db.enableRisuaiProTools,
        setValue: (db, val) => db.enableRisuaiProTools = val,
        keywords: ['pro', 'tools', 'accessibility'],
    }
];
