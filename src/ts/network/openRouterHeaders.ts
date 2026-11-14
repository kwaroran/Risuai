const openRouterHostname = 'openrouter.ai'

export function isOpenRouterUrl(url: string): boolean {
    try {
        const hostname = new URL(url).hostname.toLowerCase()
        return hostname === openRouterHostname || hostname.endsWith(`.${openRouterHostname}`)
    } catch {
        return false
    }
}

/**
 * Adds OpenRouter app attribution headers, keeping any the caller already set.
 */
export function addOpenRouterAttribution(headers: Record<string, string>): Record<string, string> {
    const names = new Set(Object.keys(headers).map((name) => name.toLowerCase()))
    if (!names.has('http-referer')) {
        headers['HTTP-Referer'] = 'https://risuai.xyz'
    }
    if (!names.has('x-title') && !names.has('x-openrouter-title')) {
        headers['X-OpenRouter-Title'] = 'Risuai'
    }
    if (!names.has('x-openrouter-categories')) {
        headers['X-OpenRouter-Categories'] = 'roleplay,general-chat'
    }
    return headers
}

/**
 * Returns a copy of plugin fetch options with attribution headers added
 * when the request goes to OpenRouter. Other requests are passed through untouched.
 */
export function withOpenRouterAttribution<T extends { headers?: unknown }>(url: string, arg?: T): T | undefined {
    if (!isOpenRouterUrl(url)) {
        return arg
    }
    const rawHeaders = arg?.headers ?? {}
    if (typeof rawHeaders !== 'object') {
        return arg
    }
    let headers: Record<string, string>
    if (Array.isArray(rawHeaders) || (typeof Headers !== 'undefined' && rawHeaders instanceof Headers)) {
        // Header lists and Headers objects become a plain object. Headers may lowercase
        // the names, which addOpenRouterAttribution already matches case-insensitively.
        try {
            headers = Object.fromEntries(new Headers(rawHeaders as HeadersInit))
        } catch {
            return arg
        }
    } else {
        headers = { ...(rawHeaders as Record<string, string>) }
    }
    return { ...arg, headers: addOpenRouterAttribution(headers) } as T
}
