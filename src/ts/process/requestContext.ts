import type { OpenAIChat } from './index.svelte'

export const requestContextCategories = [
    'prompt',
    'character',
    'lorebook',
    'module',
    'previousMessages',
    'currentMessage',
    'longTermMemory',
    'other',
] as const

export type RequestContextCategory = typeof requestContextCategories[number]

export interface RequestContextSource {
    category: RequestContextCategory
    content: string
}

export interface RequestTokenPart {
    name: RequestContextCategory
    tokens: number
}

interface TaggedOpenAIChat extends OpenAIChat {
    requestContextCategory?: RequestContextCategory
    requestContextSources?: RequestContextSource[]
}

export function setRequestContextCategory(chat: OpenAIChat, category: RequestContextCategory) {
    const taggedChat = chat as TaggedOpenAIChat
    taggedChat.requestContextCategory = category
}

export function prepareRequestContextSources(chat: OpenAIChat, fallbackCategory: RequestContextCategory) {
    const taggedChat = chat as TaggedOpenAIChat
    const category = taggedChat.requestContextCategory ?? fallbackCategory
    taggedChat.requestContextSources = [{
        category,
        content: chat.content,
    }]
}

export function appendRequestContextSources(target: OpenAIChat, source: OpenAIChat, separator: string) {
    const taggedTarget = target as TaggedOpenAIChat
    const taggedSource = source as TaggedOpenAIChat

    taggedTarget.requestContextSources ??= [{
        category: taggedTarget.requestContextCategory ?? 'other',
        content: target.content,
    }]

    const sourceParts = taggedSource.requestContextSources ?? [{
        category: taggedSource.requestContextCategory ?? 'other',
        content: source.content,
    }]

    taggedTarget.requestContextSources.push(...sourceParts.map((part, index) => ({
        ...part,
        content: index === 0 ? separator + part.content : part.content,
    })))
}

function distributeTokens(total: number, weights: Map<RequestContextCategory, number>) {
    const entries = [...weights.entries()]
    const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0)

    if(totalWeight <= 0){
        return new Map<RequestContextCategory, number>([['other', total]])
    }

    const result = new Map<RequestContextCategory, number>()
    const remainders: {category: RequestContextCategory, fraction: number}[] = []
    let assigned = 0

    for(const [category, weight] of entries){
        const exact = total * weight / totalWeight
        const tokens = Math.floor(exact)
        result.set(category, tokens)
        remainders.push({category, fraction: exact - tokens})
        assigned += tokens
    }

    remainders.sort((a, b) => b.fraction - a.fraction)
    for(let i = 0; i < total - assigned; i++){
        const category = remainders[i % remainders.length].category
        result.set(category, (result.get(category) ?? 0) + 1)
    }

    return result
}

export async function calculateRequestTokenParts(
    chats: OpenAIChat[],
    tokenizeChat: (chat: OpenAIChat) => Promise<number>,
    tokenizeText: (text: string) => Promise<number>,
): Promise<RequestTokenPart[]> {
    const totals = new Map<RequestContextCategory, number>()

    for(const chat of chats){
        const taggedChat = chat as TaggedOpenAIChat
        const chatTokens = await tokenizeChat(chat)
        const sources = taggedChat.requestContextSources

        if(!sources || sources.length === 0){
            totals.set('other', (totals.get('other') ?? 0) + chatTokens)
            continue
        }

        const categories = new Set(sources.map((source) => source.category))
        if(categories.size === 1){
            const category = sources[0].category
            totals.set(category, (totals.get(category) ?? 0) + chatTokens)
            continue
        }

        const weights = new Map<RequestContextCategory, number>()
        for(const source of sources){
            const tokens = await tokenizeText(source.content)
            const weight = tokens > 0 ? tokens : Math.max(source.content.length, 1)
            weights.set(source.category, (weights.get(source.category) ?? 0) + weight)
        }

        for(const [category, tokens] of distributeTokens(chatTokens, weights)){
            totals.set(category, (totals.get(category) ?? 0) + tokens)
        }
    }

    return requestContextCategories
        .map((name) => ({name, tokens: totals.get(name) ?? 0}))
        .filter((part) => part.tokens > 0)
}

export function clearRequestContextMetadata(chats: OpenAIChat[]) {
    for(const chat of chats){
        const taggedChat = chat as TaggedOpenAIChat
        delete taggedChat.requestContextCategory
        delete taggedChat.requestContextSources
    }
}
