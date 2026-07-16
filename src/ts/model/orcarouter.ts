import type { ModelGridItem } from "./modelGrid"

// OrcaRouter is an OpenAI-compatible LLM gateway (https://www.orcarouter.ai).
// Its `/v1/models?detailed=true` endpoint returns the catalog with pricing and
// context info (CORS-enabled, no key required), mirroring OpenRouter's format.
export const ORCAROUTER_CHAT_ENDPOINT = "https://api.orcarouter.ai/v1/chat/completions"
const ORCAROUTER_MODELS_ENDPOINT = "https://api.orcarouter.ai/v1/models?detailed=true"

// `orcarouter/auto` is OrcaRouter's adaptive router: it picks the best upstream
// model per request. It is surfaced first as the recommended default.
const ORCAROUTER_AUTO_ID = "orcarouter/auto"

type PriceEntry = number | undefined

export type OrcaRouterModelInfo = {
    id: string
    name: string
    provider: string
    /** Weighted-average price used for sorting: (prompt*3 + completion) / 4 */
    price: number
    context_length: number
    description: string
    promptPrice1M: PriceEntry
    completionPrice1M: PriceEntry
    cacheReadPrice1M: PriceEntry
}

/**
 * Whether a catalog entry is a chat-capable LLM (as opposed to an image, video,
 * embedding, TTS/STT, rerank, or completions/responses-only model). OrcaRouter
 * routes many non-chat families through the same catalog, and a few chat ids
 * only work on /v1/completions or /v1/responses (codex, gpt-5*-pro).
 */
function isChatModel(m: any): boolean {
    const id = String(m?.id ?? "").toLowerCase()
    const endpoints: string[] = m?.supported_endpoint_types ?? []
    const outputModalities: string[] = m?.architecture?.output_modalities ?? []

    if (endpoints.includes("image-generation") || endpoints.includes("openai-video")) return false
    if (outputModalities.includes("image")) return false
    if (["imagen", "dall-e", "gpt-image", "grok-imagine"].some((k) => id.includes(k))) return false
    if (id.includes("embedding") || id.includes("tts") || id.endsWith("-speech")) return false
    if (id.includes("whisper") || id.includes("transcrib") || id.includes("rerank")) return false
    if (endpoints.includes("openai-response") && !endpoints.includes("openai")) return false
    if (id.includes("codex")) return false
    if (/openai\/gpt-5(\.\d+)?-pro/.test(id)) return false

    return endpoints.includes("openai") || endpoints.includes("anthropic") || endpoints.includes("gemini")
}

const toPrice1M = (raw: any): PriceEntry => {
    const n = Number(raw)
    return raw !== undefined && raw !== null && raw !== "" && !isNaN(n) ? n : undefined
}

export async function getOrcaRouterModels(): Promise<OrcaRouterModelInfo[]> {
    try {
        const aim = await fetch(ORCAROUTER_MODELS_ENDPOINT, {
            headers: { "Content-Type": "application/json" },
        }).then((res) => res.json())

        const models: OrcaRouterModelInfo[] = (aim?.data ?? [])
            .filter(isChatModel)
            .map((m: any): OrcaRouterModelInfo => {
                // `pricing.*_per_million` is already USD per 1M tokens.
                const promptPrice1M = toPrice1M(m.pricing?.prompt_per_million)
                const completionPrice1M = toPrice1M(m.pricing?.completion_per_million)
                const cacheReadPrice1M = toPrice1M(m.pricing?.cache_read_per_million)
                const price = ((promptPrice1M ?? 0) * 3 + (completionPrice1M ?? 0)) / 4

                // Prefer the provider name from the display name ("Anthropic: …").
                const colonIdx = String(m.name ?? "").indexOf(":")
                const provider =
                    colonIdx !== -1 ? String(m.name).slice(0, colonIdx).trim() : String(m.id).split("/")[0]
                const cleanName = colonIdx !== -1 ? String(m.name).slice(colonIdx + 1).trim() : m.name || m.id

                return {
                    id: m.id,
                    name: cleanName,
                    provider,
                    price,
                    context_length: m.top_provider?.context_length ?? m.context_length ?? 0,
                    description: m.description ?? "",
                    promptPrice1M,
                    completionPrice1M,
                    cacheReadPrice1M,
                }
            })
            .sort((a: OrcaRouterModelInfo, b: OrcaRouterModelInfo) => a.price - b.price)

        // Ensure the adaptive router is present and pinned to the top.
        const withoutAuto = models.filter((m) => m.id !== ORCAROUTER_AUTO_ID)
        withoutAuto.unshift({
            id: ORCAROUTER_AUTO_ID,
            name: "OrcaRouter Auto",
            provider: "OrcaRouter",
            price: 0,
            context_length: 128_000,
            description:
                "Adaptively routes each request to the best available upstream model based on cost, latency, and quality.",
            promptPrice1M: undefined,
            completionPrice1M: undefined,
            cacheReadPrice1M: undefined,
        })

        return withoutAuto
    } catch (error) {
        return []
    }
}

export function toModelGridItem(m: OrcaRouterModelInfo): ModelGridItem {
    const fmt = (p: PriceEntry): string | null => {
        if (p === undefined) return null
        if (p === 0) return "Free"
        return `$${p.toFixed(2)}`
    }

    const prices: { label: string; value: string }[] = []
    const pairs: [string, PriceEntry][] = [
        ["In", m.promptPrice1M],
        ["Out", m.completionPrice1M],
        ["Cache In", m.cacheReadPrice1M],
    ]
    for (const [label, p] of pairs) {
        const v = fmt(p)
        if (v !== null) prices.push({ label, value: v })
    }

    return {
        id: m.id,
        displayName: m.name,
        providerName: m.provider,
        description: m.description,
        context_length: m.context_length,
        sortPrice: m.price,
        prices,
    }
}
