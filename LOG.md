# LOG

## 2026-05-15 - OpenAI Responses API module split

- Moved the OpenAI Responses API implementation out of `src/ts/process/request/openAI/requests.ts` into `src/ts/process/request/openAI/responses.ts`, keeping `requestOpenAIResponseAPI` and `__testResponsesAPI` re-exported from `requests.ts` for existing imports.
- Moved the local-network request option helper shared by Chat Completions and Responses into `src/ts/process/request/openAI/shared.ts` to avoid introducing a circular dependency.
- Left `src/ts/process/request/openAI/index.ts` behavior unchanged via the existing exports from `requests.ts`.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - failed, 21 passed and 3 failed; failures were existing reasoning-output whitespace expectations receiving extra blank lines in `<Thoughts>` output.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

Follow-up validation:

- Fixed the accidental Responses reasoning wrapper whitespace regression so full-response reasoning now formats as `<Thoughts>\n${reasoning}\n</Thoughts>\n${finalText}`, matching the pre-split behavior and existing tests.
- Confirmed the split still avoids a circular import: `responses.ts` imports the shared local-network helper from `shared.ts`, and `requests.ts` only re-exports `requestOpenAIResponseAPI` and `__testResponsesAPI` from `responses.ts` for old imports.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 24 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

## 2026-05-15 - Responses API reasoning summary requests

- Added default `reasoning.summary: 'auto'` to OpenAI Responses API request bodies when the selected model exposes `reasoning_effort`, preserving the existing `reasoning.effort` mapping and stateless `store: false` behavior.
- Kept non-reasoning Responses models and Chat Completions requests unchanged, and left reverse proxy/custom additional parameters able to override `reasoning.summary` after body construction.
- Added deterministic coverage for reasoning-model defaults, non-reasoning model omission, and reverse proxy additional-param override.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 24 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

## 2026-05-15 - Responses API reasoning text parsing

- Root cause: Responses reasoning items vary by provider, but the parser only handled a narrow summary shape and streaming only listened for `response.reasoning_summary_text.delta`, so OpenRouter-style `content[].type = reasoning_text` and other reasoning-text variants were missed.
- Fixed non-streaming extraction to collect reasoning text from summary arrays, content arrays, direct reasoning text fields, and common text field names while preserving the existing no-empty-`<Thoughts>` behavior for empty summaries.
- Fixed streaming extraction to accept reasoning text delta/done event variants, keep streamed reasoning when a completed event only contains final text, and let completed full-response parsing replace the stream state without duplicating final output.
- Re-checked stateless continuation sanitization so reasoning items and `rs_...` ids are dropped from external follow-up input.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 21 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

## 2026-05-14 - OpenAI Responses API final outbound continuation sanitization

- Followed up on the persisted `rs_...` reasoning item report where a Responses tool call output contained a reasoning item before the `function_call`, and the next stateless request still failed with `Item with id 'rs_...' not found`.
- Fixed the remaining leak by sanitizing a cloned outbound Responses body at the final request/log/preview boundary when `store: false`, dropping accidental reasoning items and stripping server-only `id` fields from `function_call` and message items before serialization.
- Updated function-call extraction to return sanitized function-call items, avoiding raw `fc_...` server ids in continuation input.
- Added regression coverage for the exact reasoning-before-function-call output shape and for external body snapshots staying clean after later internal mutations.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 17 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

## 2026-05-14 - OpenAI Responses API stateless tool continuation fix

- Fixed non-streaming Responses API tool continuation with `store: false` sending raw server output items back in `input`, including persisted/reference-style `id: rs_...` values that OpenAI cannot resolve when items are not stored.
- Added a continuation sanitizer that reconstructs legal stateless input items for assistant messages and `function_call` items, preserving `call_id`, `name`, `arguments`, and compatible status while stripping server-only IDs and metadata before appending matching `function_call_output` items.
- Applied the same sanitizer to the shared Responses tool-output append path used by streaming continuation, and tightened the assistant/tool prefix formatting to avoid extra blank separators when no remembered tool-call code is emitted.
- Added deterministic non-streaming and streaming regression tests that verify follow-up request input does not contain `rs_...` IDs and does contain sanitized `function_call` plus matching `function_call_output` items.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 17 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

## 2026-05-12 - OpenAI Responses API final deterministic validation

- Re-validated the Responses API suite against the final non-live checklist for endpoint/key/model selection, reverse proxy and custom additional parameters, NanoGPT Responses wiring, optional `aiModel`, external body cleanliness, body compatibility, parsing, streaming, and deterministic test coverage.
- Found no production-code defects during final deterministic validation.
- Added focused deterministic tests for OpenAI default endpoint/key/model and non-streaming `stream: false`, externally clean fetch bodies, custom model endpoint/key/additional params and headers, system role behavior without the developer-role flag, source multimodal immutability, failed non-streaming responses, completed streaming events without duplicated text, and streaming error chunk usefulness.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 15 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

Remaining live-smoke-test checklist:

- Run a real non-streaming OpenAI Responses request with text-only history and structured output enabled.
- Run a real streaming OpenAI Responses request and verify UI stream rendering remains incremental with chunks shaped as `{ "0": text }`.
- Run a live MCP tool call through Responses, including `rememberToolUsage` and `simplifiedToolUse` toggles.
- Run a live NanoGPT Responses request for both standard and subscription endpoints if NanoGPT exposes compatible `/responses` behavior in the target account.
- Run a live built-in web search tool request on a model/provider that supports `web_search_preview`.
- Run a reverse-proxy/custom-provider smoke test to confirm provider-specific Responses event names and additional headers/body params are accepted.

## 2026-05-12 - OpenAI Responses API hardening pass 2

- Fixed Responses request construction to tolerate an omitted `arg.aiModel` without crashing in custom/preview paths, falling back to a deterministic OpenAI Responses model id when no internal id is available.
- Wired NanoGPT Responses requests to NanoGPT's Responses endpoint, selected NanoGPT request model, NanoGPT API key, and non-subscription provider header instead of falling through to OpenAI URL/key/model defaults.
- Hardened Responses request sending, streaming continuation fetches, previews, and fetch logs to strip internal `__lastOutput` continuation state before external exposure.
- Added deterministic coverage for optional `aiModel`, NanoGPT Responses endpoint/auth/model/provider wiring, reverse-proxy Responses endpoint autofill with additional params, and internal continuation-state stripping.

Commands run:

- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 9 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

Remaining live-smoke-test requirements:

- Run a real non-streaming OpenAI Responses request with text-only history and structured output enabled.
- Run a real streaming OpenAI Responses request and verify UI stream rendering remains incremental with chunks shaped as `{ "0": text }`.
- Run a live MCP tool call through Responses, including `rememberToolUsage` and `simplifiedToolUse` toggles.
- Run a live NanoGPT Responses request for both standard and subscription endpoints if NanoGPT exposes compatible `/responses` behavior in the target account.
- Run a live built-in web search tool request on a model/provider that supports `web_search_preview`.
- Run a reverse-proxy/custom-provider smoke test to confirm provider-specific Responses event names and additional headers/body params are accepted.

## 2026-05-12 - OpenAI Responses API validation

- Validated Responses API request-body construction for plain text history, system-to-developer role conversion, assistant history/prefill preservation, image and file inputs, `store: false`, `max_output_tokens`, `temperature`, `top_p`, `reasoning.effort`, `text.verbosity`, structured output under `text.format`, MCP function tools, and built-in web search tools.
- Validated reverse proxy/custom compatibility paths for additional body parameters and headers by inspection of the shared `applyAdditionalParameters` path in `requestOpenAIResponseAPI`.
- Validated non-streaming parsing for top-level `output_text`, message output blocks, refusal-only responses, failed/error statuses, incomplete statuses, reasoning summaries as `<Thoughts>...</Thoughts>`, and function-call extraction/continuation paths.
- Validated streaming parsing for split SSE chunks, CRLF event separators, final unterminated events, output text deltas, completed response replacement, failed/error events, function-call argument deltas, output item completion, tool continuation, and returned stream chunk shape `{ "0": text }`.
- Added focused unit coverage in `src/ts/process/request/openAI/requests.responses.test.ts` using test hooks exported from `requests.ts` for body building, text extraction, incomplete response failure handling, and Responses SSE parsing.
- Fixed duplicate non-streaming output when OpenAI returns both top-level `output_text` and equivalent message `output_text` blocks.
- Fixed incomplete Responses results being returned as success when partial text was present; they now return `fail` with the incomplete reason and partial text.
- Fixed Responses streaming SSE parsing for CRLF separators and final buffered events without a trailing blank-line delimiter.
- Avoided mutating formatted input history while converting multimodal messages for Responses requests.

Commands run:

- `pnpm vitest run src/ts/process/request/openAI/requests.responses.test.ts` - blocked by pnpm ignored-builds policy (`ERR_PNPM_IGNORED_BUILDS`).
- `./node_modules/.bin/vitest run src/ts/process/request/openAI/requests.responses.test.ts` - passed, 5 tests.
- `./node_modules/.bin/svelte-check --tsconfig ./tsconfig.json` - passed, 0 errors and 0 warnings.

Remaining live-smoke-test requirements:

- Run a real non-streaming OpenAI Responses request with text-only history and structured output enabled.
- Run a real streaming OpenAI Responses request and verify UI stream rendering remains incremental with chunks shaped as `{ "0": text }`.
- Run a live MCP tool call through Responses, including `rememberToolUsage` and `simplifiedToolUse` toggles.
- Run a live built-in web search tool request on a model/provider that supports `web_search_preview`.
- Run a reverse-proxy/custom-provider smoke test to confirm provider-specific Responses event names and additional headers/body params are accepted.

## 2026-05-12 - OpenAI Responses API production support

- Refactored `requestOpenAIResponseAPI` with local helpers for Responses input conversion, request body construction, parsing, streaming SSE handling, and tool continuation.
- Added full-history Responses requests with `store: false` by default and no `previous_response_id` persistence.
- Mapped supported model parameters to Responses fields, including `max_output_tokens`, `temperature`, `top_p`, `reasoning.effort`, and `text.verbosity`, while preserving separate-parameter handling through existing utilities.
- Added developer-role conversion for system messages when `LLMFlags.DeveloperRole` is present.
- Added Responses structured output via `text.format` and preserved `extractJson` on parsed final text.
- Converted MCP tools to Responses function tools, added built-in web search as `{ type: 'web_search_preview' }`, parsed function-call outputs, executed tools with `callTool`, appended `function_call_output` items, and preserved remembered tool usage with `encodeToolCall`.
- Added non-streaming parsing for all output text blocks, refusals, failed/incomplete responses, and extractable reasoning summaries using the app's `<Thoughts>...</Thoughts>` convention.
- Added Responses streaming with `fetchNative`, request logging, abort/chatId/local-network options, text deltas, reasoning-summary deltas, function-call argument deltas, output item completion, response completion, and tool-call continuation.
- Applied custom additional parameters and headers to reverse proxy and custom model Responses flows.

Remaining risks:

- Responses API event names and output item shapes may vary across proxy providers; the implementation accepts the current OpenAI event names and uses safe fallbacks for unknown output.
- Streaming tool calls rely on `response.output_item.done` to provide final function names and call IDs; argument deltas without a final item are retained but may be incomplete if a provider omits the done event.
- `simplifiedToolUse` is approximated for Responses by omitting assistant message content from continued input where possible while preserving function-call items required by the API.
