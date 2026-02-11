import { getDatabase } from "../storage/database.svelte"

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

type OpenRouterModel = {
    canonical_slug: string
    context_length: number
    id: string
    name: string
    pricing: {
        prompt: string,
        completion: string,
        web_search: string,
        input_cache_read: string
    }
}

export async function getOpenRouterModels(): Promise<OpenRouterModel[]> {
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
            let name = model.name
            let price = ((Number(model.pricing.prompt) * 3) + Number(model.pricing.completion)) / 4
            if(price > 0){
                name += ` - $${(price*1000).toFixed(5)}/1k`
            }
            else{
                name += " - Free"
            }
            return {
                id: model.id,
                name: name,
                price: price,
                context_length: model.context_length,
            }
        }).filter((model: any) => {
            return model.price >= 0
        }).sort((a: any, b: any) => {
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
