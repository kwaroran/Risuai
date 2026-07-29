import { beforeEach, describe, expect, it, vi } from 'vitest'

import { applyParameters } from '../shared'

const mocks = vi.hoisted(() => ({
    db: {
        reasoningEffort: 0,
        seperateParametersEnabled: false,
    },
}))

vi.mock('src/ts/storage/database.svelte', () => ({
    getDatabase: () => mocks.db,
}))

describe('reasoning effort parameters', () => {
    beforeEach(() => {
        mocks.db.reasoningEffort = 0
        mocks.db.seperateParametersEnabled = false
    })

    it('maps the custom provider maximum effort to max', () => {
        mocks.db.reasoningEffort = 4

        const body = applyParameters(
            {},
            [
                'reasoning_effort',
                'reasoning_effort_no_disabled',
                'reasoning_effort_xhigh',
                'reasoning_effort_max',
            ],
            {},
            'model',
            { modelId: 'custom-model' },
        )

        expect(body.reasoning_effort).toBe('max')
    })

    it('uses the documented nested field for Responses API effort', () => {
        mocks.db.reasoningEffort = 4

        const body = applyParameters(
            {},
            ['reasoning_effort', 'reasoning_effort_max'],
            { reasoning_effort: 'reasoning.effort' },
            'model',
            { modelId: 'custom-responses-model' },
        )

        expect(body).toEqual({ reasoning: { effort: 'max' } })
    })

    it('uses the documented nested field for Anthropic effort', () => {
        mocks.db.reasoningEffort = 4

        const body = applyParameters(
            {},
            ['reasoning_effort', 'reasoning_effort_max'],
            { reasoning_effort: 'output_config.effort' },
            'model',
            { modelId: 'custom-anthropic-model' },
        )

        expect(body).toEqual({ output_config: { effort: 'max' } })
    })

    it('falls back to low when a stale disabled value is used by a low-to-max model', () => {
        mocks.db.reasoningEffort = -1

        const body = applyParameters(
            {},
            ['reasoning_effort', 'reasoning_effort_no_disabled'],
            {},
            'model',
            { modelId: 'custom-model' },
        )

        expect(body.reasoning_effort).toBe('low')
    })

    it('caps max at the highest effort supported by the selected format', () => {
        mocks.db.reasoningEffort = 4

        const xhighBody = applyParameters(
            {},
            ['reasoning_effort', 'reasoning_effort_xhigh'],
            {},
            'model',
            { modelId: 'custom-mistral-model' },
        )
        const highBody = applyParameters(
            {},
            ['reasoning_effort'],
            {},
            'model',
            { modelId: 'custom-gemini-model' },
        )

        expect(xhighBody.reasoning_effort).toBe('xhigh')
        expect(highBody.reasoning_effort).toBe('high')
    })
})
