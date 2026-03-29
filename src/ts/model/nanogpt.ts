import { getDatabase } from "../storage/database.svelte"
import { NANOGPT_PERSONALIZED_MODELS_ENDPOINT, NANOGPT_MODELS_ENDPOINT } from "./providers/nanogpt"

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
            promptPrice1M: toPrice1M(m.pricing?.prompt),
            completionPrice1M: toPrice1M(m.pricing?.completion),
        }))
    } catch (e) {
        return []
    }
}

function toPrice1M(raw: any): number | undefined {
    const n = Number(raw)
    return raw != null && raw !== '' && !isNaN(n) ? n * 1_000_000 : undefined
}
