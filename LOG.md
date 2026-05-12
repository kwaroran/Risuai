# LOG

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
