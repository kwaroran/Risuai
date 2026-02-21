const localHostnames = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

function normalizeHostname(hostname: string): string {
    const trimmed = hostname.trim().toLowerCase();
    if (!trimmed) {
        return '';
    }
    const unwrapped = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
    return unwrapped.split('%')[0];
}

function parseIPv4(hostname: string): number[] | null {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
        return null;
    }
    const parts = hostname.split('.').map((part) => Number(part));
    if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return null;
    }
    return parts;
}

function parseIPv6(hostname: string): Uint8Array | null {
    if (!/^[0-9a-f:.]+$/i.test(hostname)) {
        return null;
    }

    let normalized = hostname;
    if (normalized.includes('.')) {
        const lastColonIndex = normalized.lastIndexOf(':');
        if (lastColonIndex === -1) {
            return null;
        }
        const ipv4Tail = parseIPv4(normalized.slice(lastColonIndex + 1));
        if (!ipv4Tail) {
            return null;
        }
        const high = ((ipv4Tail[0] << 8) | ipv4Tail[1]).toString(16);
        const low = ((ipv4Tail[2] << 8) | ipv4Tail[3]).toString(16);
        normalized = `${normalized.slice(0, lastColonIndex)}:${high}:${low}`;
    }

    if (normalized.includes(':::')) {
        return null;
    }

    let groups: string[] = [];
    if (normalized.includes('::')) {
        const [leftRaw, rightRaw] = normalized.split('::');
        const left = leftRaw ? leftRaw.split(':') : [];
        const right = rightRaw ? rightRaw.split(':') : [];
        if (left.some((group) => group.length === 0) || right.some((group) => group.length === 0)) {
            return null;
        }
        const missing = 8 - (left.length + right.length);
        if (missing < 1) {
            return null;
        }
        groups = [...left, ...Array(missing).fill('0'), ...right];
    }
    else {
        groups = normalized.split(':');
        if (groups.length !== 8) {
            return null;
        }
    }

    if (groups.length !== 8) {
        return null;
    }

    const bytes = new Uint8Array(16);
    for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        if (!/^[0-9a-f]{1,4}$/i.test(group)) {
            return null;
        }
        const value = Number.parseInt(group, 16);
        bytes[i * 2] = (value >> 8) & 0xff;
        bytes[i * 2 + 1] = value & 0xff;
    }

    return bytes;
}

function isIPv6Loopback(bytes: Uint8Array): boolean {
    for (let i = 0; i < 15; i++) {
        if (bytes[i] !== 0) {
            return false;
        }
    }
    return bytes[15] === 1;
}

export function isLocalNetworkHost(hostname: string): boolean {
    const normalized = normalizeHostname(hostname);
    if (!normalized) {
        return false;
    }

    if (localHostnames.has(normalized)) {
        return true;
    }

    if (normalized.endsWith('.local')) {
        return true;
    }

    const ipv4 = parseIPv4(normalized);
    if (ipv4) {
        const [a, b] = ipv4;
        if (a === 10) {
            return true;
        }
        if (a === 172 && b >= 16 && b <= 31) {
            return true;
        }
        if (a === 192 && b === 168) {
            return true;
        }
        if (a === 169 && b === 254) {
            return true;
        }
        return false;
    }

    const ipv6 = parseIPv6(normalized);
    if (!ipv6) {
        return false;
    }

    if (isIPv6Loopback(ipv6)) {
        return true;
    }

    if ((ipv6[0] & 0xfe) === 0xfc) {
        return true;
    }

    if (ipv6[0] === 0xfe && (ipv6[1] & 0xc0) === 0x80) {
        return true;
    }

    return false;
}

export function isLocalNetworkUrl(url: string): boolean {
    try {
        const parsed = new URL(url);
        return isLocalNetworkHost(parsed.hostname);
    }
    catch {
        return false;
    }
}

