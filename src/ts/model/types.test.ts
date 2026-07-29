import { describe, expect, it } from 'vitest'

import { getCustomModelParameters, LLMFormat } from './types'

describe('getCustomModelParameters', () => {
    it('keeps token budgets as the backwards-compatible default', () => {
        const parameters = getCustomModelParameters(LLMFormat.OpenAICompatible)

        expect(parameters).toContain('thinking_tokens')
        expect(parameters).not.toContain('reasoning_effort')
    })

    it.each([
        LLMFormat.OpenAICompatible,
        LLMFormat.OpenAIResponseAPI,
        LLMFormat.Anthropic,
        LLMFormat.AWSBedrockClaude,
    ])('exposes the full low-to-max effort ladder for format %s', (format) => {
        const parameters = getCustomModelParameters(format, 'effort')

        expect(parameters).toEqual(expect.arrayContaining([
            'reasoning_effort',
            'reasoning_effort_no_disabled',
            'reasoning_effort_xhigh',
            'reasoning_effort_max',
        ]))
        expect(parameters).not.toContain('thinking_tokens')
    })

    it('caps Mistral custom models at xhigh', () => {
        const parameters = getCustomModelParameters(LLMFormat.Mistral, 'effort')

        expect(parameters).toContain('reasoning_effort_xhigh')
        expect(parameters).not.toContain('reasoning_effort_max')
    })

    it.each([
        LLMFormat.GoogleCloud,
        LLMFormat.VertexAIGemini,
    ])('caps Gemini thinking levels at high for format %s', (format) => {
        const parameters = getCustomModelParameters(format, 'effort')

        expect(parameters).toContain('reasoning_effort')
        expect(parameters).not.toContain('reasoning_effort_xhigh')
        expect(parameters).not.toContain('reasoning_effort_max')
    })

    it('does not send an effort field to formats without documented support', () => {
        const parameters = getCustomModelParameters(LLMFormat.Cohere, 'effort')

        expect(parameters).not.toContain('reasoning_effort')
        expect(parameters).not.toContain('thinking_tokens')
    })
})
