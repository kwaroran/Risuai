export type ProxyJobWsEvent =
    | { type: 'job_accepted', jobId: string }
    | { type: 'upstream_headers', status: number, headers: Record<string, string> }
    | { type: 'chunk', dataBase64: string }
    | { type: 'error', status?: number, message: string }
    | { type: 'done' }
    | { type: 'ping', ts: number };

export function parseProxyJobWsEvent(raw: string): ProxyJobWsEvent | null {
    try {
        const parsed = JSON.parse(raw) as ProxyJobWsEvent;
        if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function decodeProxyJobWsChunk(dataBase64: string): Uint8Array {
    return Buffer.from(dataBase64, 'base64');
}

export function formatProxyStreamErrorMessage(status: number | undefined, message: string): string {
    const text = message ?? '';
    if (status === 504 || status === 524 || text.includes('Cloudflare') || text.includes('Gateway time-out') || text.includes('A timeout occurred')) {
        return `Cloudflare/origin timeout (${status ?? 'unknown'}). The origin server did not start sending response in time.`;
    }
    return text || `Proxy stream failed (${status ?? 'unknown'})`;
}
