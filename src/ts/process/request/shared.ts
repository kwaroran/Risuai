import { getDatabase } from 'src/ts/storage/database.svelte'

export type LLMParameter =
    | 'temperature'
    | 'top_k'
    | 'repetition_penalty'
    | 'min_p'
    | 'top_a'
    | 'top_p'
    | 'frequency_penalty'
    | 'presence_penalty'
    | 'reasoning_effort'
    | 'thinking_tokens'
    | 'verbosity'

export type ModelModeExtended = 'model' | 'submodel' | 'memory' | 'emotion' | 'otherAx' | 'translate'

export function setObjectValue<T>(obj: T, key: string, value: any): T {
    const splitKey = key.split('.')
    if (splitKey.length > 1) {
        const firstKey = splitKey.shift()
        if (!obj[firstKey]) {
            obj[firstKey] = {}
        }
        obj[firstKey] = setObjectValue(obj[firstKey], splitKey.join('.'), value)
        return obj
    }

    obj[key] = value
    return obj
}

export function applyParameters(
    data: Record<string, any>,
    parameters: LLMParameter[],
    rename: Partial<Record<LLMParameter, string>>,
    ModelMode: ModelModeExtended,
    arg: {
        ignoreTopKIfZero?: boolean
    } = {},
): Record<string, any> {
    const db = getDatabase()

    function getEffort(effort: number) {
        switch (effort) {
            case -1: {
                return 'minimal'
            }
            case 0: {
                return 'low'
            }
            case 1: {
                return 'medium'
            }
            case 2: {
                return 'high'
            }
            default: {
                return 'medium'
            }
        }
    }

    function getVerbosity(verbosity: number) {
        switch (verbosity) {
            case 0: {
                return 'low'
            }
            case 1: {
                return 'medium'
            }
            case 2: {
                return 'high'
            }
            default: {
                return 'medium'
            }
        }
    }

    if (db.seperateParametersEnabled && ModelMode !== 'model') {
        if (ModelMode === 'submodel') {
            ModelMode = 'otherAx'
        }

        for (const parameter of parameters) {
            let value: number | string = 0
            if (parameter === 'top_k' && arg.ignoreTopKIfZero && db.seperateParameters[ModelMode][parameter] === 0) {
                continue
            }

            switch (parameter) {
                case 'temperature': {
                    value =
                        db.seperateParameters[ModelMode].temperature === -1000
                            ? -1000
                            : db.seperateParameters[ModelMode].temperature / 100
                    break
                }
                case 'top_k': {
                    value = db.seperateParameters[ModelMode].top_k
                    break
                }
                case 'repetition_penalty': {
                    value = db.seperateParameters[ModelMode].repetition_penalty
                    break
                }
                case 'min_p': {
                    value = db.seperateParameters[ModelMode].min_p
                    break
                }
                case 'top_a': {
                    value = db.seperateParameters[ModelMode].top_a
                    break
                }
                case 'top_p': {
                    value = db.seperateParameters[ModelMode].top_p
                    break
                }
                case 'thinking_tokens': {
                    value = db.seperateParameters[ModelMode].thinking_tokens
                    break
                }
                case 'frequency_penalty': {
                    value =
                        db.seperateParameters[ModelMode].frequency_penalty === -1000
                            ? -1000
                            : db.seperateParameters[ModelMode].frequency_penalty / 100
                    break
                }
                case 'presence_penalty': {
                    value =
                        db.seperateParameters[ModelMode].presence_penalty === -1000
                            ? -1000
                            : db.seperateParameters[ModelMode].presence_penalty / 100
                    break
                }
                case 'reasoning_effort': {
                    value = getEffort(db.seperateParameters[ModelMode].reasoning_effort)
                    break
                }
                case 'verbosity': {
                    value = getVerbosity(db.seperateParameters[ModelMode].verbosity)
                    break
                }
            }

            if (
                value === -1000 ||
                value === undefined ||
                value === null ||
                (typeof value === 'number' && isNaN(value))
            ) {
                continue
            }

            data = setObjectValue(data, rename[parameter] ?? parameter, value)
        }
        return data
    }

    for (const parameter of parameters) {
        let value: number | string = 0
        if (parameter === 'top_k' && arg.ignoreTopKIfZero && db.top_k === 0) {
            continue
        }
        switch (parameter) {
            case 'temperature': {
                value = db.temperature === -1000 ? -1000 : db.temperature / 100
                break
            }
            case 'top_k': {
                value = db.top_k
                break
            }
            case 'repetition_penalty': {
                value = db.repetition_penalty
                break
            }
            case 'min_p': {
                value = db.min_p
                break
            }
            case 'top_a': {
                value = db.top_a
                break
            }
            case 'top_p': {
                value = db.top_p
                break
            }
            case 'reasoning_effort': {
                value = getEffort(db.reasoningEffort)
                break
            }
            case 'verbosity': {
                value = getVerbosity(db.verbosity)
                break
            }
            case 'frequency_penalty': {
                value = db.frequencyPenalty === -1000 ? -1000 : db.frequencyPenalty / 100
                break
            }
            case 'presence_penalty': {
                value = db.PresensePenalty === -1000 ? -1000 : db.PresensePenalty / 100
                break
            }
            case 'thinking_tokens': {
                value = db.thinkingTokens
                break
            }
        }

        if (value === -1000) {
            continue
        }

        data = setObjectValue(data, rename[parameter] ?? parameter, value)
    }
    return data
}
