const relaxedJsonKeywords = [
    ['True', 'true'],
    ['False', 'false'],
    ['None', 'null']
] as const

function isRelaxedJsonBoundary(char: string | undefined) {
    return !char || !/[A-Za-z0-9_$]/.test(char)
}

function normalizeRelaxedJsonKeywords(value: string) {
    let normalized = ''
    let quote: '"' | "'" | null = null

    for (let i = 0; i < value.length; i++) {
        const char = value[i]

        if (quote) {
            normalized += char

            if (char === '\\' && i + 1 < value.length) {
                normalized += value[++i]
                continue
            }

            if (char === quote) {
                quote = null
            }

            continue
        }

        if (char === '"' || char === "'") {
            quote = char
            normalized += char
            continue
        }

        let replaced = false

        for (const [keyword, replacement] of relaxedJsonKeywords) {
            if (
                value.startsWith(keyword, i) &&
                isRelaxedJsonBoundary(value[i - 1]) &&
                isRelaxedJsonBoundary(value[i + keyword.length])
            ) {
                normalized += replacement
                i += keyword.length - 1
                replaced = true
                break
            }
        }

        if (!replaced) {
            normalized += char
        }
    }

    return normalized
}

export function parseAdditionalParamJsonValue(value: string): unknown | undefined {
    try {
        return JSON.parse(value)
    } catch {}

    const normalized = normalizeRelaxedJsonKeywords(value)

    if (normalized === value) {
        return undefined
    }

    try {
        return JSON.parse(normalized)
    } catch {
        return undefined
    }
}
