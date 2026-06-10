import { getDatabase } from "src/ts/storage/database.svelte"
import { LLMProvider } from "src/ts/model/types"
import { isLocalNetworkUrl } from "src/ts/network/localNetwork"

export interface LocalNetworkRequestOptions {
    networkRoute?: 'auto' | 'local_network'
    requestTimeoutMs?: number
}

export function getLocalNetworkRequestOptions(url: string, db = getDatabase(), useStreaming = false): LocalNetworkRequestOptions {
    if (!db.localNetworkMode || !isLocalNetworkUrl(url)) {
        return {}
    }

    const timeoutSec = Number.isFinite(db.localNetworkTimeoutSec) && db.localNetworkTimeoutSec > 0
        ? db.localNetworkTimeoutSec
        : 600

    return {
        networkRoute: 'local_network',
        requestTimeoutMs: useStreaming ? Math.max(1, Math.floor(timeoutSec * 1000)) : undefined
    }
}

function isOfficialOpenAIURL(url: string): boolean {
    try {
        return new URL(url).hostname === 'api.openai.com'
    } catch {
        return false
    }
}

export function shouldUseOpenAIFlexProcessing(aiModel: string | undefined, url: string, provider: LLMProvider): boolean {
    const isCustomEndpoint = aiModel === 'reverse_proxy' || !!aiModel?.startsWith('xcustom:::')
    return provider === LLMProvider.OpenAI || (isCustomEndpoint && isOfficialOpenAIURL(url))
}
