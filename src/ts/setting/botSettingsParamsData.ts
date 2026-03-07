/**
 * Bot Settings - Parameters Tab Data
 *
 * Data-driven definition for BotSettings Parameters tab (submenu === 1).
 * Contains standard parameter settings like context size, temperature, etc.
 */

import type { SettingItem } from './types';
import { LLMFlags } from '../model/types';

/**
 * Basic parameter settings that are always visible
 */
export const basicParameterItems: SettingItem[] = [
    {
        id: 'params.maxContext',
        type: 'number',
        labelKey: 'maxContextSize',
        getValue: (db) => (db as any).maxContext, setValue: (db, val) => (db as any).maxContext = val,
        options: { min: 0 },
        keywords: ['context', 'size', 'token', 'limit'],
    },
    {
        id: 'params.maxResponse',
        type: 'number',
        labelKey: 'maxResponseSize',
        getValue: (db) => (db as any).maxResponse, setValue: (db, val) => (db as any).maxResponse = val,
        options: { min: 0, max: 2048 },
        keywords: ['response', 'size', 'output', 'length'],
    },
];

/**
 * Seed setting - only for certain models
 */
export const seedSetting: SettingItem = {
    id: 'params.seed',
    type: 'number',
    labelKey: 'seed',
    getValue: (db) => (db as any).generationSeed, setValue: (db, val) => (db as any).generationSeed = val,
    condition: (ctx) => 
        ctx.db.aiModel.startsWith('gpt') || 
        ctx.db.aiModel === 'reverse_proxy' || 
        ctx.db.aiModel === 'openrouter',
    keywords: ['seed', 'random', 'deterministic'],
};

/**
 * Temperature and common sampling parameters
 */
export const samplingParameterItems: SettingItem[] = [
    {
        id: 'params.temperature',
        type: 'slider',
        labelKey: 'temperature',
        helpKey: 'tempature',
        getValue: (db) => (db as any).temperature, setValue: (db, val) => (db as any).temperature = val,
        options: {
            min: 0,
            max: 200,
            multiple: 0.01,
            fixed: 2,
            disableable: true,
        },
        keywords: ['temperature', 'creativity', 'randomness'],
    },
];

/**
 * OpenAI-style penalty parameters
 * These are conditionally shown based on modelInfo.parameters
 */
export const penaltyParameterItems: SettingItem[] = [
    {
        id: 'params.frequencyPenalty',
        type: 'slider',
        labelKey: 'frequencyPenalty',
        getValue: (db) => (db as any).frequencyPenalty, setValue: (db, val) => (db as any).frequencyPenalty = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('frequency_penalty'),
        options: {
            min: 0,
            max: 200,
            multiple: 0.01,
            fixed: 2,
            disableable: true,
        },
        keywords: ['frequency', 'penalty', 'repetition'],
    },
    {
        id: 'params.presencePenalty',
        type: 'slider',
        labelKey: 'presensePenalty',
        getValue: (db) => (db as any).PresensePenalty, setValue: (db, val) => (db as any).PresensePenalty = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('presence_penalty'),
        options: {
            min: 0,
            max: 200,
            multiple: 0.01,
            fixed: 2,
            disableable: true,
        },
        keywords: ['presence', 'penalty'],
    },
    {
        id: 'params.topP',
        type: 'slider',
        fallbackLabel: 'Top P',
        getValue: (db) => (db as any)['top_p'], setValue: (db, val) => (db as any)['top_p'] = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('top_p'),
        options: {
            min: 0,
            max: 1,
            step: 0.01,
            fixed: 2,
            disableable: true,
        },
        keywords: ['top', 'p', 'nucleus', 'sampling'],
    },
];

/**
 * Model-specific parameters that depend on modelInfo.parameters
 */
export const modelSpecificParameterItems: SettingItem[] = [
    {
        id: 'params.thinkingType',
        type: 'segmented',
        labelKey: 'thinkingType',
        getValue: (db) => (db as any).thinkingType, setValue: (db, val) => (db as any).thinkingType = val,
        condition: (ctx) =>
            ctx.modelInfo.flags.includes(LLMFlags.claudeThinking) ||
            ctx.modelInfo.flags.includes(LLMFlags.claudeAdaptiveThinking),
        options: {
            segmentOptions: [
                { value: 'off', label: 'Off' },
                { value: 'budget', label: 'Budget (Manual Tokens)', condition: (ctx) => ctx.modelInfo.flags.includes(LLMFlags.claudeThinking)  },
                { value: 'adaptive', label: 'Adaptive', condition: (ctx) => ctx.modelInfo.flags.includes(LLMFlags.claudeAdaptiveThinking) },
            ]
        },
        keywords: ['thinking', 'type', 'mode', 'adaptive', 'budget'],
    },
    {
        id: 'params.thinkingTokens',
        type: 'slider',
        labelKey: 'thinkingTokens',
        getValue: (db) => (db as any).thinkingTokens, setValue: (db, val) => (db as any).thinkingTokens = val,
        condition: (ctx) =>
            ctx.modelInfo.parameters.includes('thinking_tokens') &&
            ctx.db.thinkingType === 'budget',
        options: {
            min: -1,
            max: 64000,
            step: 200,
            disableable: true,
        },
        keywords: ['thinking', 'tokens', 'reasoning'],
    },
    {
        id: 'params.adaptiveThinkingEffort',
        type: 'segmented',
        labelKey: 'adaptiveThinkingEffort',
        getValue: (db) => (db as any).adaptiveThinkingEffort, setValue: (db, val) => (db as any).adaptiveThinkingEffort = val,
        condition: (ctx) =>
            ctx.modelInfo.flags.includes(LLMFlags.claudeAdaptiveThinking) &&
            ctx.db.thinkingType === 'adaptive',
        options: {
            segmentOptions: [
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
                { value: 'high', label: 'High' },
                { value: 'max', label: 'Max' },
            ]
        },
        keywords: ['adaptive', 'thinking', 'effort'],
    },
    {
        id: 'params.topK',
        type: 'slider',
        fallbackLabel: 'Top K',
        getValue: (db) => (db as any)['top_k'], setValue: (db, val) => (db as any)['top_k'] = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('top_k'),
        options: {
            min: 0,
            max: 100,
            step: 1,
            disableable: true,
        },
        keywords: ['top', 'k', 'sampling'],
    },
    {
        id: 'params.minP',
        type: 'slider',
        fallbackLabel: 'Min P',
        getValue: (db) => (db as any)['min_p'], setValue: (db, val) => (db as any)['min_p'] = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('min_p'),
        options: {
            min: 0,
            max: 1,
            step: 0.01,
            fixed: 2,
            disableable: true,
        },
        keywords: ['min', 'p', 'sampling'],
    },
    {
        id: 'params.topA',
        type: 'slider',
        fallbackLabel: 'Top A',
        getValue: (db) => (db as any)['top_a'], setValue: (db, val) => (db as any)['top_a'] = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('top_a'),
        options: {
            min: 0,
            max: 1,
            step: 0.01,
            fixed: 2,
            disableable: true,
        },
        keywords: ['top', 'a', 'sampling'],
    },
    {
        id: 'params.repetitionPenalty',
        type: 'slider',
        fallbackLabel: 'Repetition penalty',
        getValue: (db) => (db as any)['repetition_penalty'], setValue: (db, val) => (db as any)['repetition_penalty'] = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('repetition_penalty'),
        options: {
            min: 0,
            max: 2,
            step: 0.01,
            fixed: 2,
            disableable: true,
        },
        keywords: ['repetition', 'penalty'],
    },
    {
        id: 'params.reasoningEffort',
        type: 'slider',
        fallbackLabel: 'Reasoning Effort',
        getValue: (db) => (db as any).reasoningEffort, setValue: (db, val) => (db as any).reasoningEffort = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('reasoning_effort'),
        options: {
            min: -1,
            max: 2,
            step: 1,
            fixed: 0,
            disableable: true,
        },
        keywords: ['reasoning', 'effort'],
    },
    {
        id: 'params.verbosity',
        type: 'slider',
        fallbackLabel: 'Verbosity',
        getValue: (db) => (db as any).verbosity, setValue: (db, val) => (db as any).verbosity = val,
        condition: (ctx) => ctx.modelInfo.parameters.includes('verbosity'),
        options: {
            min: 0,
            max: 2,
            step: 1,
            fixed: 0,
            disableable: true,
        },
        keywords: ['verbosity', 'length'],
    },
];

/**
 * All basic parameter items combined for Parameters tab
 * Order: maxContext, maxResponse, seed, thinkingType, thinkingTokens, adaptiveThinkingEffort, temperature, topK, minP, topA, repetitionPenalty, reasoningEffort, verbosity, topP, frequencyPenalty, presencePenalty
 */
export const allBasicParameterItems: SettingItem[] = [
    // Basic settings (always shown)
    ...basicParameterItems,
    seedSetting,

    // Model-specific sampling parameters (in user-specified order)
    modelSpecificParameterItems.find(i => i.id === 'params.thinkingType')!,
    modelSpecificParameterItems.find(i => i.id === 'params.thinkingTokens')!,
    modelSpecificParameterItems.find(i => i.id === 'params.adaptiveThinkingEffort')!,
    ...samplingParameterItems, // temperature
    modelSpecificParameterItems.find(i => i.id === 'params.topK')!,
    modelSpecificParameterItems.find(i => i.id === 'params.minP')!,
    modelSpecificParameterItems.find(i => i.id === 'params.topA')!,
    modelSpecificParameterItems.find(i => i.id === 'params.repetitionPenalty')!,
    modelSpecificParameterItems.find(i => i.id === 'params.reasoningEffort')!,
    modelSpecificParameterItems.find(i => i.id === 'params.verbosity')!,
    penaltyParameterItems.find(i => i.id === 'params.topP')!,
    penaltyParameterItems.find(i => i.id === 'params.frequencyPenalty')!,
    penaltyParameterItems.find(i => i.id === 'params.presencePenalty')!,
    // NOTE: separateParametersItem is now handled via custom component below
];

/**
 * Separate Parameters section (custom component)
 */
export const separateParametersItem: SettingItem = {
    id: 'params.separateParameters',
    type: 'custom',
    componentId: 'SeparateParametersSection' as any,
    keywords: ['separate', 'parameters', 'memory', 'emotion', 'translate'],
};
