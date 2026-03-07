
import type { SettingItem } from './types';
import { isNodeServer, isTauri } from '../platform';

export const advancedSettingsItems: SettingItem[] = [
    { type: 'header', id: 'adv.header', labelKey: 'advancedSettings', options: { level: 'h2' }, classes: '!mb-0' },
    { type: 'header', id: 'adv.warn', labelKey: 'advancedSettingsWarn', options: { level: 'warning' } },

    // LoreBook Settings
    {
        id: 'adv.lbDepth', type: 'number', labelKey: 'loreBookDepth', getValue: (db) => (db as any).loreBookDepth, setValue: (db, val) => (db as any).loreBookDepth = val,
        options: { min: 0, max: 20 },
        classes: 'mt-4 mb-2'
    },
    {
        id: 'adv.lbToken', type: 'number', labelKey: 'loreBookToken', getValue: (db) => (db as any).loreBookToken, setValue: (db, val) => (db as any).loreBookToken = val,
        options: { min: 0, max: 4096 }
    },
    {
        id: 'adv.autoContinueMin', type: 'number', labelKey: 'autoContinueMinTokens', getValue: (db) => (db as any).autoContinueMinTokens, setValue: (db, val) => (db as any).autoContinueMinTokens = val,
        options: { min: 0 }
    },

    // Prompts
    {
        id: 'adv.addPrompt', type: 'text', labelKey: 'additionalPrompt', getValue: (db) => (db as any).additionalPrompt, setValue: (db, val) => (db as any).additionalPrompt = val,
        helpKey: 'additionalPrompt'
    },
    {
        id: 'adv.descPrefix', type: 'text', labelKey: 'descriptionPrefix', getValue: (db) => (db as any).descriptionPrefix, setValue: (db, val) => (db as any).descriptionPrefix = val
    },
    {
        id: 'adv.emoPrompt', type: 'text', labelKey: 'emotionPrompt', getValue: (db) => (db as any).emotionPrompt2, setValue: (db, val) => (db as any).emotionPrompt2 = val,
        helpKey: 'emotionPrompt', options: { placeholder: 'Leave it blank to use default' }
    },
    {
        id: 'adv.keiUrl', type: 'text', fallbackLabel: 'Kei Server URL', getValue: (db) => (db as any).keiServerURL, setValue: (db, val) => (db as any).keiServerURL = val,
        options: { placeholder: 'Leave it blank to use default' }
    },
    {
        id: 'adv.presetChain', type: 'text', labelKey: 'presetChain', getValue: (db) => (db as any).presetChain, setValue: (db, val) => (db as any).presetChain = val,
        helpKey: 'presetChain', options: { placeholder: 'Leave it blank to not use' }
    },

    // Request Settings
    {
        id: 'adv.retries', type: 'number', labelKey: 'requestretrys', getValue: (db) => (db as any).requestRetrys, setValue: (db, val) => (db as any).requestRetrys = val,
        helpKey: 'requestretrys', options: { min: 0, max: 20 }
    },
    {
        id: 'adv.genTime', type: 'number', labelKey: 'genTimes', getValue: (db) => (db as any).genTime, setValue: (db, val) => (db as any).genTime = val,
        helpKey: 'genTimes', options: { min: 0, max: 4096 }
    },
    {
        id: 'adv.assetAlloc', type: 'number', labelKey: 'assetMaxDifference', getValue: (db) => (db as any).assetMaxDifference, setValue: (db, val) => (db as any).assetMaxDifference = val
    },

    // Vision Quality
    {
        id: 'adv.visionQual', type: 'select', fallbackLabel: 'Vision Quality', getValue: (db) => (db as any).gptVisionQuality, setValue: (db, val) => (db as any).gptVisionQuality = val,
        helpKey: 'gptVisionQuality',
        options: {
            selectOptions: [
                { value: 'low', label: 'Low' },
                { value: 'high', label: 'High' }
            ]
        }
    },

    // Height Mode
    {
        id: 'adv.heightMode', type: 'select', labelKey: 'heightMode', getValue: (db) => (db as any).heightMode, setValue: (db, val) => (db as any).heightMode = val,
        options: {
            selectOptions: [
                { value: 'normal', label: 'Normal' },
                { value: 'percent', label: 'Percent' },
                { value: 'vh', label: 'VH' },
                { value: 'dvh', label: 'DVH' },
                { value: 'svh', label: 'SVH' },
                { value: 'lvh', label: 'LVH' }
            ]
        }
    },

    // Request Location (Non-Node/Tauri)
    {
        id: 'adv.reqLoc', type: 'segmented', labelKey: 'requestLocation', getValue: (db) => (db as any).requestLocation, setValue: (db, val) => (db as any).requestLocation = val,
        condition: () => !isNodeServer && !isTauri,
        options: {
            segmentOptions: [
                { value: '', label: 'Default' },
                { value: 'eu', label: 'EU (GDPR)' },
                { value: 'fedramp', label: 'US (FedRAMP)' }
            ]
        }
    },

    // Toggles
    { id: 'adv.sayNothing', type: 'check', labelKey: 'sayNothing', getValue: (db) => (db as any).useSayNothing, setValue: (db, val) => (db as any).useSayNothing = val, helpKey: 'sayNothing', classes: 'mt-4' },
    { id: 'adv.showUnrec', type: 'check', labelKey: 'showUnrecommended', getValue: (db) => (db as any).showUnrecommended, setValue: (db, val) => (db as any).showUnrecommended = val, helpKey: 'showUnrecommended', classes: 'mt-4' },
    { id: 'adv.imgComp', type: 'check', labelKey: 'imageCompression', getValue: (db) => (db as any).imageCompression, setValue: (db, val) => (db as any).imageCompression = val, helpKey: 'imageCompression', classes: 'mt-4' },
    { id: 'adv.useExp', type: 'check', labelKey: 'useExperimental', getValue: (db) => (db as any).useExperimental, setValue: (db, val) => (db as any).useExperimental = val, helpKey: 'useExperimental', classes: 'mt-4' },
    { id: 'adv.sourceMap', type: 'check', labelKey: 'sourcemapTranslate', getValue: (db) => (db as any).sourcemapTranslate, setValue: (db, val) => (db as any).sourcemapTranslate = val, helpKey: 'sourcemapTranslate', classes: 'mt-4' },
    { id: 'adv.forceProxy', type: 'check', labelKey: 'forceProxyAsOpenAI', getValue: (db) => (db as any).forceProxyAsOpenAI, setValue: (db, val) => (db as any).forceProxyAsOpenAI = val, helpKey: 'forceProxyAsOpenAI', classes: 'mt-4' },
    { id: 'adv.legacyMedia', type: 'check', labelKey: 'legacyMediaFindings', getValue: (db) => (db as any).legacyMediaFindings, setValue: (db, val) => (db as any).legacyMediaFindings = val, helpKey: 'legacyMediaFindings', classes: 'mt-4' },
    { id: 'adv.autoFill', type: 'check', labelKey: 'autoFillRequestURL', getValue: (db) => (db as any).autofillRequestUrl, setValue: (db, val) => (db as any).autofillRequestUrl = val, helpKey: 'autoFillRequestURL', classes: 'mt-4' },
    { id: 'adv.autoCont', type: 'check', labelKey: 'autoContinueChat', getValue: (db) => (db as any).autoContinueChat, setValue: (db, val) => (db as any).autoContinueChat = val, helpKey: 'autoContinueChat', classes: 'mt-4' },
    { id: 'adv.remIncomp', type: 'check', labelKey: 'removeIncompleteResponse', getValue: (db) => (db as any).removeIncompleteResponse, setValue: (db, val) => (db as any).removeIncompleteResponse = val, classes: 'mt-4' },
    { id: 'adv.newOai', type: 'check', labelKey: 'newOAIHandle', getValue: (db) => (db as any).newOAIHandle, setValue: (db, val) => (db as any).newOAIHandle = val, classes: 'mt-4' },
    { id: 'adv.noWaitTrans', type: 'check', labelKey: 'noWaitForTranslate', getValue: (db) => (db as any).noWaitForTranslate, setValue: (db, val) => (db as any).noWaitForTranslate = val, classes: 'mt-4' },
    { id: 'adv.newImgBeta', type: 'check', labelKey: 'newImageHandlingBeta', getValue: (db) => (db as any).newImageHandlingBeta, setValue: (db, val) => (db as any).newImageHandlingBeta = val, classes: 'mt-4' },
    { id: 'adv.allowExt', type: 'check', fallbackLabel: 'Allow all in file select', getValue: (db) => (db as any).allowAllExtentionFiles, setValue: (db, val) => (db as any).allowAllExtentionFiles = val, classes: 'mt-4' },
    { id: 'adv.dynamicModelRegistry', type: 'check', labelKey: 'dynamicModelRegistry', getValue: (db) => (db as any).dynamicModelRegistry, setValue: (db, val) => (db as any).dynamicModelRegistry = val, classes: 'mt-4' },
    { id: 'adv.disableSeperateParameterChangeOnPresetChange', type: 'check', labelKey: 'disableSeperateParameterChangeOnPresetChange', getValue: (db) => (db as any).disableSeperateParameterChangeOnPresetChange, setValue: (db, val) => (db as any).disableSeperateParameterChangeOnPresetChange = val, classes: 'mt-4' },
    // Experimental Section (visible when useExperimental is true)
    {
        id: 'adv.exp.googleToken', type: 'check', labelKey: 'googleCloudTokenization', getValue: (db) => (db as any).googleClaudeTokenizing, setValue: (db, val) => (db as any).googleClaudeTokenizing = val,
        condition: (ctx) => ctx.db.useExperimental, showExperimental: true, classes: 'mt-4'
    },
    {
        id: 'adv.exp.cachePoint', type: 'check', labelKey: 'automaticCachePoint', getValue: (db) => (db as any).automaticCachePoint, setValue: (db, val) => (db as any).automaticCachePoint = val,
        condition: (ctx) => ctx.db.useExperimental, helpKey: 'automaticCachePoint', showExperimental: true, classes: 'mt-4'
    },
    {
        id: 'adv.exp.chatComp', type: 'check', labelKey: 'experimentalChatCompression', getValue: (db) => (db as any).chatCompression, setValue: (db, val) => (db as any).chatCompression = val,
        condition: (ctx) => ctx.db.useExperimental, helpKey: 'experimentalChatCompressionDesc', showExperimental: true, classes: 'mt-4'
    },

    // Unrecommended Section
    {
        id: 'adv.cot', type: 'check', labelKey: 'cot', getValue: (db) => (db as any).chainOfThought, setValue: (db, val) => (db as any).chainOfThought = val,
        condition: (ctx) => ctx.db.showUnrecommended, helpKey: 'customChainOfThought', helpUnrecommended: true, classes: 'mt-4'
    },

    // More Toggles
    { id: 'adv.remPunc', type: 'check', labelKey: 'removePunctuationHypa', getValue: (db) => (db as any).removePunctuationHypa, setValue: (db, val) => (db as any).removePunctuationHypa = val, helpKey: 'removePunctuationHypa', classes: 'mt-4' },
    { id: 'adv.devTools', type: 'check', labelKey: 'enableDevTools', getValue: (db) => (db as any).enableDevTools, setValue: (db, val) => (db as any).enableDevTools = val, classes: 'mt-4' },
    { id: 'adv.scrollToActive', type: 'check', labelKey: 'enableScrollToActiveChar', getValue: (db) => (db as any).enableScrollToActiveChar, setValue: (db, val) => (db as any).enableScrollToActiveChar = val, helpKey: 'enableScrollToActiveChar', classes: 'mt-4' },

    // Node/Tauri Specific
    {
        id: 'adv.promptInfo', type: 'check', labelKey: 'promptInfoInsideChat', getValue: (db) => (db as any).promptInfoInsideChat, setValue: (db, val) => (db as any).promptInfoInsideChat = val,
        condition: () => isNodeServer || isTauri, helpKey: 'promptInfoInsideChatDesc', classes: 'mt-4'
    },
    {
        id: 'adv.promptTextInfo', type: 'check', labelKey: 'promptTextInfoInsideChat', getValue: (db) => (db as any).promptTextInfoInsideChat, setValue: (db, val) => (db as any).promptTextInfoInsideChat = val,
        condition: (ctx) => (isNodeServer || isTauri) && ctx.db.promptInfoInsideChat, classes: 'mt-4'
    },
    {
        id: 'adv.remoteSave', type: 'check', labelKey: 'enableRemoteSaving', getValue: (db) => (db as any).enableRemoteSaving, setValue: (db, val) => (db as any).enableRemoteSaving = val,
    },

    // Dynamic Assets & Others
    { id: 'adv.dynAssets', type: 'check', labelKey: 'dynamicAssets', getValue: (db) => (db as any).dynamicAssets, setValue: (db, val) => (db as any).dynamicAssets = val, helpKey: 'dynamicAssets', classes: 'mt-4' },
    { id: 'adv.realmOpen', type: 'check', labelKey: 'realmDirectOpen', getValue: (db) => (db as any).realmDirectOpen, setValue: (db, val) => (db as any).realmDirectOpen = val, helpKey: 'realmDirectOpen', classes: 'mt-4' },
    { id: 'adv.cssErr', type: 'check', labelKey: 'returnCSSError', getValue: (db) => (db as any).returnCSSError, setValue: (db, val) => (db as any).returnCSSError = val, classes: 'mt-4' },
    { id: 'adv.antiOverload', type: 'check', labelKey: 'antiServerOverload', getValue: (db) => (db as any).antiServerOverloads, setValue: (db, val) => (db as any).antiServerOverloads = val, classes: 'mt-4' },
    { id: 'adv.claudeCache', type: 'check', labelKey: 'claude1HourCaching', getValue: (db) => (db as any).claude1HourCaching, setValue: (db, val) => (db as any).claude1HourCaching = val, classes: 'mt-4' },
    { id: 'adv.claudeBatch', type: 'check', labelKey: 'claudeBatching', getValue: (db) => (db as any).claudeBatching, setValue: (db, val) => (db as any).claudeBatching = val, showExperimental: true, classes: 'mt-4' },
    { id: 'adv.personaNote', type: 'check', labelKey: 'personaNote', getValue: (db) => (db as any).personaNote, setValue: (db, val) => (db as any).personaNote = val, showExperimental: true, classes: 'mt-4' },
    { id: 'adv.toolUsage', type: 'check', labelKey: 'rememberToolUsage', getValue: (db) => (db as any).rememberToolUsage, setValue: (db, val) => (db as any).rememberToolUsage = val, classes: 'mt-4' },
    { id: 'adv.bookmark', type: 'check', labelKey: 'bookmark', getValue: (db) => (db as any).enableBookmark, setValue: (db, val) => (db as any).enableBookmark = val, classes: 'mt-4' },
    { id: 'adv.simpleTool', type: 'check', labelKey: 'simplifiedToolUse', getValue: (db) => (db as any).simplifiedToolUse, setValue: (db, val) => (db as any).simplifiedToolUse = val, classes: 'mt-4' },
    { id: 'adv.tokCache', type: 'check', labelKey: 'useTokenizerCaching', getValue: (db) => (db as any).useTokenizerCaching, setValue: (db, val) => (db as any).useTokenizerCaching = val, classes: 'mt-4' },
    { id: 'adv.auxModelUnderModelSettings', type: 'check', labelKey: 'auxModelUnderModelSettings', getValue: (db) => (db as any).auxModelUnderModelSettings, setValue: (db, val) => (db as any).auxModelUnderModelSettings = val, classes: 'mt-4' },
    { id: 'adv.devMode', type: 'check', labelKey: 'pluginDevelopMode', getValue: (db) => (db as any).pluginDevelopMode, setValue: (db, val) => (db as any).pluginDevelopMode = val, classes: 'mt-4' },

    // More Experimental (Condition: useExperimental)
    {
        id: 'adv.exp.googleTrans', type: 'check', fallbackLabel: 'New Google Translate Experimental', getValue: (db) => (db as any).useExperimentalGoogleTranslator, setValue: (db, val) => (db as any).useExperimentalGoogleTranslator = val,
        condition: (ctx) => ctx.db.useExperimental, helpKey: 'unrecommended', helpUnrecommended: true, classes: 'mt-4'
    },
    {
        id: 'adv.exp.claudeRet', type: 'check', labelKey: 'claudeCachingRetrival', getValue: (db) => (db as any).claudeRetrivalCaching, setValue: (db, val) => (db as any).claudeRetrivalCaching = val,
        condition: (ctx) => ctx.db.useExperimental, helpKey: 'unrecommended', helpUnrecommended: true, classes: 'mt-4'
    },

    // Sync (Condition: db.account.useSync)
    {
        id: 'adv.sync.realm', type: 'check', fallbackLabel: 'Lightning Realm Import', getValue: (db) => (db as any).lightningRealmImport, setValue: (db, val) => (db as any).lightningRealmImport = val,
        condition: (ctx) => !!ctx.db.account?.useSync, showExperimental: true, classes: 'mt-4'
    },

    // Dynamic Assets Edit (Condition: dynamicAssets)
    {
        id: 'adv.dynAssetsEdit', type: 'check', labelKey: 'dynamicAssetsEditDisplay', getValue: (db) => (db as any).dynamicAssetsEditDisplay, setValue: (db, val) => (db as any).dynamicAssetsEditDisplay = val,
        condition: (ctx) => ctx.db.dynamicAssets, helpKey: 'dynamicAssetsEditDisplay', classes: 'mt-4'
    },

    // Unrecommended Extra (Condition: showUnrecommended)
    {
        id: 'adv.plainFetch', type: 'check', labelKey: 'forcePlainFetch', getValue: (db) => (db as any).usePlainFetch, setValue: (db, val) => (db as any).usePlainFetch = val,
        condition: (ctx) => ctx.db.showUnrecommended, helpKey: 'forcePlainFetch', helpUnrecommended: true, classes: 'mt-4'
    },
    {
        id: 'adv.depTrig', type: 'check', labelKey: 'showDeprecatedTriggerV1', getValue: (db) => (db as any).showDeprecatedTriggerV1, setValue: (db, val) => (db as any).showDeprecatedTriggerV1 = val,
        condition: (ctx) => ctx.db.showUnrecommended, helpKey: 'unrecommended', helpUnrecommended: true, classes: 'mt-4'
    },

    // Custom Components
    { type: 'custom', id: 'adv.banChar', componentId: 'BanCharacterSetSettings' },
    { type: 'custom', id: 'adv.customModels', componentId: 'CustomModelsSettings' },
    { type: 'custom', id: 'adv.export', componentId: 'SettingsExportButtons' },
];
