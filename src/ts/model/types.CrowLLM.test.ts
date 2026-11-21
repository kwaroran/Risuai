import { describe, expect, it } from 'vitest'

import { LLMFlags, LLMFormat, LLMProvider, LLMTokenizer, OpenAIParameters, ProviderNames, type LLMModel } from 'src/ts/model/types'

describe('CrowLLM provider', () => {
    it('is registered as an LLMProvider with a display name', () => {
        expect(typeof LLMProvider.CrowLLM).toBe('number')
        expect(ProviderNames.get(LLMProvider.CrowLLM)).toBe('CrowLLM')
    })

    it('describes DeepSeek V4 Flash as an OpenAI-compatible endpoint', () => {
        const model: LLMModel = {
            id: 'deepseek-v4-flash',
            name: 'DeepSeek V4 Flash',
            provider: LLMProvider.CrowLLM,
            format: LLMFormat.OpenAICompatible,
            flags: [LLMFlags.hasFullSystemPrompt, LLMFlags.hasStreaming],
            parameters: OpenAIParameters,
            tokenizer: LLMTokenizer.Unknown,
            endpoint: 'https://crowllm.com/v1/chat/completions',
            keyIdentifier: 'crowllm',
        }

        expect(model.format).toBe(LLMFormat.OpenAICompatible)
        expect(model.endpoint).toBe('https://crowllm.com/v1/chat/completions')
        expect(model.keyIdentifier).toBe('crowllm')
        expect(model.flags).toContain(LLMFlags.hasStreaming)
    })
})
