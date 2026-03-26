import { getDatabase } from "../storage/database.svelte"

export type OpenRouterModelInfo = {
    id: string
    /** Original name with price appended, kept for backward compatibility */
    name: string
    /** Clean model name without price info */
    cleanName: string
    /** Provider display name extracted from model name (e.g. "OpenAI", "Anthropic") */
    provider: string
    price: number
    /** Human-readable price string, e.g. "$0.01500/1k" or "Free" */
    priceDisplay: string
    context_length: number
}

export async function getOpenRouterProviders(): Promise<{ name: string, slug: string }[]> {
    try {
        const db = getDatabase()
        const headers = {
            "Authorization": "Bearer " + db.openrouterKey,
            "Content-Type": "application/json"
        }

        const providers: { data: { name: string, slug: string }[] } = await fetch("https://openrouter.ai/api/v1/providers", {
            headers,
        }).then((res) => res.json())

        return providers.data.map(({ name, slug }) => ( { name, slug })).sort((a, b) => a.name.localeCompare(b.name))
    } catch (error) {
        return []
    }
}

export async function getOpenRouterModels(): Promise<OpenRouterModelInfo[]> {
    try {
        const db = getDatabase()
        const headers = {
            "Authorization": "Bearer " + db.openrouterKey,
            "Content-Type": "application/json"
        }

        const aim = await fetch("https://openrouter.ai/api/v1/models", {
            headers,
        }).then((res) => res.json())

        return aim.data.map((model: any) => {
            const price = ((Number(model.pricing.prompt) * 3) + Number(model.pricing.completion)) / 4
            const priceDisplay = price > 0 ? `$${(price * 1000).toFixed(5)}/1k` : 'Free'
            const legacyName = price > 0
                ? `${model.name} - $${(price * 1000).toFixed(5)}/1k`
                : `${model.name} - Free`

            const colonIdx = model.name.indexOf(':')
            const provider = colonIdx !== -1
                ? model.name.slice(0, colonIdx).trim()
                : model.id.split('/')[0]
            const cleanName = colonIdx !== -1
                ? model.name.slice(colonIdx + 1).trim()
                : model.name

            return {
                id: model.id,
                name: legacyName,
                cleanName,
                provider,
                price,
                priceDisplay,
                context_length: model.context_length,
            }
        }).filter((model: OpenRouterModelInfo) => {
            return model.price >= 0
        }).sort((a: OpenRouterModelInfo, b: OpenRouterModelInfo) => {
            return a.price - b.price
        })
    } catch (error) {
        return []
    }
}

export async function getFreeOpenRouterModels(){
    const models = await getOpenRouterModels()
    return models.filter((model: any) => {
        return model.name.endsWith("Free")
    }).sort((a: any, b: any) => {
        return b.context_length - a.context_length
    })[0].id ?? ''
}
