// NanoGPT endpoint constants.
// Models are fetched dynamically via getNanoGPTModels() in model/nanogpt.ts,
// not registered statically in LLMModels (same pattern as OpenRouter).

export const NANOGPT_CHAT_ENDPOINT = 'https://nano-gpt.com/api/v1/chat/completions'
export const NANOGPT_RESPONSES_ENDPOINT = 'https://nano-gpt.com/api/v1/responses'
export const NANOGPT_MESSAGES_ENDPOINT = 'https://nano-gpt.com/api/v1/messages'
export const NANOGPT_LEGACY_ENDPOINT = 'https://nano-gpt.com/api/v1/completions'
export const NANOGPT_MODELS_ENDPOINT = 'https://nano-gpt.com/api/v1/models'
export const NANOGPT_PERSONALIZED_MODELS_ENDPOINT = 'https://nano-gpt.com/api/personalized/v1/models'
export const NANOGPT_BALANCE_ENDPOINT = 'https://nano-gpt.com/api/check-balance'
export const NANOGPT_SUBSCRIPTION_ENDPOINT = 'https://nano-gpt.com/api/subscription/v1/usage'
export const NANOGPT_MODEL_PROVIDERS_ENDPOINT = 'https://nano-gpt.com/api/models'
