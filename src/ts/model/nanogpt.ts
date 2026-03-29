import { getDatabase } from "../storage/database.svelte"
import { NANOGPT_PERSONALIZED_MODELS_ENDPOINT, NANOGPT_MODELS_ENDPOINT } from "./providers/nanogpt"
import type { ModelGridItem } from "./modelGrid"

export type NanoGPTModelInfo = {
    id: string
    name: string
    owned_by: string
    context_length: number
    max_output_tokens: number
    description: string
    capabilities: {
        vision?: boolean
        reasoning?: boolean
        tool_calling?: boolean
        [key: string]: boolean | undefined
    }
    /** Input (prompt) price per 1M tokens in USD */
    promptPrice1M: number | undefined
    /** Output (completion) price per 1M tokens in USD */
    completionPrice1M: number | undefined
}

export async function getNanoGPTModels(): Promise<NanoGPTModelInfo[]> {
    try {
        const db = getDatabase()
        const key = db.nanogptKey

        const endpoint = (key ? NANOGPT_PERSONALIZED_MODELS_ENDPOINT : NANOGPT_MODELS_ENDPOINT) + '?detailed=true'
        const headers: Record<string, string> = { "Content-Type": "application/json" }
        if (key) {
            headers["Authorization"] = "Bearer " + key
        }

        const res = await fetch(endpoint, { headers })
        const json = await res.json()

        const models: any[] = json?.data ?? []

        return models.map((m) => ({
            id: m.id,
            name: m.name || m.id,
            owned_by: m.owned_by ?? '',
            context_length: m.context_length ?? 0,
            max_output_tokens: m.max_output_tokens ?? 0,
            description: m.description ?? '',
            capabilities: m.capabilities ?? {},
            promptPrice1M: parsePrice(m.pricing?.prompt),
            completionPrice1M: parsePrice(m.pricing?.completion),
        }))
    } catch (e) {
        return []
    }
}

export function toModelGridItem(m: NanoGPTModelInfo): ModelGridItem {
    const fmt = (p: number | undefined): string | null => {
        if (p === undefined) return null
        if (p === 0) return 'Free'
        return `$${p.toFixed(2)}`
    }

    const prices: { label: string; value: string }[] = []
    const pairs: [string, number | undefined][] = [
        ['In',  m.promptPrice1M],
        ['Out', m.completionPrice1M],
    ]
    for (const [label, p] of pairs) {
        const v = fmt(p)
        if (v !== null) prices.push({ label, value: v })
    }

    return {
        id: m.id,
        displayName: m.name,
        providerName: m.owned_by,
        description: m.description,
        context_length: m.context_length,
        sortPrice: m.promptPrice1M ?? Infinity,
        prices,
    }
}

function parsePrice(raw: any): number | undefined {
    const n = Number(raw)
    return raw != null && raw !== '' && !isNaN(n) ? n : undefined
}
