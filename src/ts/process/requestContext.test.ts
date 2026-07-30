import { describe, expect, it } from 'vitest'
import type { OpenAIChat } from './index.svelte'
import {
    appendRequestContextSources,
    calculateRequestTokenParts,
    clearRequestContextMetadata,
    prepareRequestContextSources,
    setRequestContextCategory,
} from './requestContext'

const tokenizeText = async (text: string) => text.length
const tokenizeChat = async (chat: OpenAIChat) => chat.content.length + 3

describe('request context token breakdown', () => {
    it('preserves the exact input token total across categories', async () => {
        const character: OpenAIChat = {role: 'system', content: 'character'}
        const lorebook: OpenAIChat = {role: 'system', content: 'lore'}
        setRequestContextCategory(character, 'character')
        setRequestContextCategory(lorebook, 'lorebook')
        prepareRequestContextSources(character, 'other')
        prepareRequestContextSources(lorebook, 'other')

        appendRequestContextSources(character, lorebook, '\n\n')
        character.content += '\n\n' + lorebook.content

        const parts = await calculateRequestTokenParts([character], tokenizeChat, tokenizeText)

        expect(parts.reduce((sum, part) => sum + part.tokens, 0)).toBe(await tokenizeChat(character))
        expect(parts.find((part) => part.name === 'character')?.tokens).toBeGreaterThan(0)
        expect(parts.find((part) => part.name === 'lorebook')?.tokens).toBeGreaterThan(0)
    })

    it('uses other for untagged request messages', async () => {
        const chat: OpenAIChat = {role: 'system', content: 'untracked'}
        const parts = await calculateRequestTokenParts([chat], tokenizeChat, tokenizeText)

        expect(parts).toEqual([{name: 'other', tokens: await tokenizeChat(chat)}])
    })

    it('removes internal attribution metadata before provider handoff', () => {
        const chat: OpenAIChat = {role: 'user', content: 'hello'}
        setRequestContextCategory(chat, 'currentMessage')
        prepareRequestContextSources(chat, 'other')

        clearRequestContextMetadata([chat])

        expect(chat).toEqual({role: 'user', content: 'hello'})
    })
})
