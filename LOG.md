# LOG

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
