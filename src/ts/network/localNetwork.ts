function normalizeHost(hostname: string): string {
    return hostname.trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0]
}

function isIPv4(host: string): boolean {
    const parts = host.split('.')
    if (parts.length !== 4) {
        return false
    }
    for (const part of parts) {
        if (!/^\d+$/.test(part)) {
            return false
        }
        const value = Number(part)
        if (!Number.isInteger(value) || value < 0 || value > 255) {
            return false
        }
    }
    return true
}

function isLocalIPv4(host: string): boolean {
    if (!isIPv4(host)) {
        return false
    }
    const [a, b] = host.split('.').map((v) => Number(v))
    if (a === 10) {
        return true
    }
    if (a === 172 && b >= 16 && b <= 31) {
        return true
    }
    if (a === 192 && b === 168) {
        return true
    }
    if (a === 169 && b === 254) {
        return true
    }
    return false
}

function isLocalIPv6(host: string): boolean {
    if (!host.includes(':')) {
        return false
    }

    if (host === '::1') {
        return true
    }

    const first = host.split(':')[0]
    if (!first) {
        return false
    }

    const firstHextet = Number.parseInt(first, 16)
    if (!Number.isFinite(firstHextet)) {
        return false
    }

    // fc00::/7
    if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) {
        return true
    }

    // fe80::/10
    if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) {
        return true
    }

    return false
}

export function isLocalNetworkHost(hostname: string): boolean {
    const host = normalizeHost(hostname)
    if (!host) {
        return false
    }

    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host === '::1') {
        return true
    }

    if (host.endsWith('.local')) {
        return true
    }

    // Docker/lan internal DNS labels like "litellm" or "model-server"
    if (/^[a-z0-9_-]+$/i.test(host) && !host.includes('.')) {
        return true
    }

    if (isLocalIPv4(host)) {
        return true
    }

    if (isLocalIPv6(host)) {
        return true
    }

    return false
}

export function isLocalNetworkUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return isLocalNetworkHost(parsed.hostname)
    }
    catch {
        return false
    }
}
