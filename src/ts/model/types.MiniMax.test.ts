import { describe, expect, it } from 'vitest'

import { LLMFlags, LLMFormat, LLMProvider, LLMTokenizer, OpenAIParameters, ProviderNames, type LLMModel } from 'src/ts/model/types'

describe('MiniMax provider', () => {
    it('is registered as an LLMProvider with a display name', () => {
        expect(typeof LLMProvider.MiniMax).toBe('number')
        expect(ProviderNames.get(LLMProvider.MiniMax)).toBe('MiniMax')
    })

    it('describes the MiniMax-M3 model as an OpenAI-compatible endpoint', () => {
        const model: LLMModel = {
            id: 'MiniMax-M3',
            name: 'MiniMax M3',
            provider: LLMProvider.MiniMax,
            format: LLMFormat.OpenAICompatible,
            flags: [LLMFlags.hasFullSystemPrompt, LLMFlags.hasImageInput, LLMFlags.hasStreaming],
            parameters: OpenAIParameters,
            tokenizer: LLMTokenizer.Unknown,
            endpoint: 'https://api.minimax.io/v1/chat/completions',
            keyIdentifier: 'MiniMax',
        }

        expect(model.format).toBe(LLMFormat.OpenAICompatible)
        expect(model.endpoint).toBe('https://api.minimax.io/v1/chat/completions')
        expect(model.keyIdentifier).toBe('MiniMax')
        expect(model.flags).toContain(LLMFlags.hasImageInput)
    })
})
