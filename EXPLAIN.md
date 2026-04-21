# Refactoring `model` prop to `paramKey` in Separate Parameters Components

## Background: What problem are we solving?

Each auxiliary task (memory, translate, emotion, otherAx) can optionally use a different model from the main chat model. The Claude thinking settings UI needs to know *which model* is being configured so it can conditionally show the "xhigh" effort option (only supported by certain models).

Before this refactor, the caller had to compute the effective model string and pass it down through two layers of components:

```
EasyPanel.svelte  -->  AllSeperateParameters.svelte  -->  ClaudeThinkingSeparateParams.svelte
     (resolve model)         (pass-through)                     (consume model)
```

This meant every call site in `EasyPanel.svelte` duplicated verbose ternary logic:

```svelte
model={(DBState.db.seperateModelsForAxModels ? DBState.db.seperateModels.memory : '') || DBState.db.subModel}
```

And `SeparateParametersSection.svelte` had to define a `getSeparateParameterModel()` helper to do the same thing.

## How Svelte 5 component props work

This project uses Svelte 5's runes API. Key concepts:

### `$props()`

Declares the component's public interface. The parent passes values via HTML-like attributes:

```svelte
<!-- Parent -->
<AllSeperateParameters bind:value={someValue} paramKey="memory" />

<!-- Child (AllSeperateParameters.svelte) -->
<script lang="ts">
    let { value = $bindable(), paramKey } = $props()
</script>
```

- `$bindable()` enables two-way binding with the parent (the parent uses `bind:value=`).
- Regular props like `paramKey` are read-only from the child's perspective.

### `$derived` and `$derived.by()`

Create reactive values that automatically recompute when their dependencies change:

```ts
// Simple expression
let modelInfo = $derived(getModelInfo(effectiveModel))

// Block form for complex logic
let effectiveModel = $derived.by(() => {
    if (!paramKey) return DBState.db.subModel
    // ...more logic...
    return paramKey
})
```

These are analogous to computed properties. When `DBState.db.subModel` or `paramKey` changes, `effectiveModel` automatically updates, which cascades into `modelInfo`, then `hasXHighEffort`, then the UI.

### `$effect()`

Runs side effects when reactive dependencies change:

```ts
$effect(() => {
    if (value.adaptive_thinking_effort === 'xhigh' && !hasXHighEffort) {
        value.adaptive_thinking_effort = 'high'
    }
})
```

This is a guard: if the user switches to a model that doesn't support xhigh, the saved effort level is automatically downgraded. Because `value` is `$bindable()`, this mutation propagates back up to the parent.

## The `paramKey` refactor

### How it works

Instead of the parent resolving a model ID string, it passes a *key* that identifies the parameter context:

| Context | `paramKey` value | Example |
|---------|-----------------|---------|
| Aux model (memory) | `"memory"` | `paramKey="memory"` |
| Aux model (translate) | `"translate"` | `paramKey="translate"` |
| Per-model override | The model ID itself | `paramKey={parameterModelSelection}` |
| Main model (no prop) | `undefined` | Falls back to `DBState.db.subModel` |

`ClaudeThinkingSeparateParams` resolves the effective model internally:

```ts
const auxModelKeys = ['memory', 'emotion', 'translate', 'otherAx']

let effectiveModel = $derived.by(() => {
    if (!paramKey) return DBState.db.subModel
    if (auxModelKeys.includes(paramKey)) {
        // It's an aux task key - look up the assigned model
        if (DBState.db.seperateModelsForAxModels) {
            return DBState.db.seperateModels[paramKey] || DBState.db.subModel
        }
        return DBState.db.subModel
    }
    // It's a direct model ID (per-model override case)
    return paramKey
})
```

The distinction between "aux key" and "model ID" is determined by checking membership in `auxModelKeys`. This works because model IDs in this codebase (e.g. `claude-opus-4-7`, `openrouter:::...`) never collide with the four fixed aux keys.

### What changed in each file

**`ClaudeThinkingSeparateParams.svelte`** - The component that actually needs the model info. Changed from receiving a pre-resolved `model` string to receiving a `paramKey` and resolving internally. This is where the logic *belongs* since this is the only consumer.

**`AllSeperateParameters.svelte`** - Thin wrapper for all parameter sliders. Changed `model` to `paramKey` as a simple pass-through. It still doesn't use the value itself; it just forwards to `ClaudeThinkingSeparateParams`.

**`EasyPanel.svelte`** - The complex caller. Simplified from inline model-resolution ternaries to just passing the key:

```svelte
<!-- Before -->
<AllSeperateParameters ... model={(DBState.db.seperateModelsForAxModels ? DBState.db.seperateModels.memory : '') || DBState.db.subModel} />

<!-- After -->
<AllSeperateParameters ... paramKey="memory" />
```

**`SeparateParametersSection.svelte`** - Deleted the `getSeparateParameterModel()` helper entirely. Now just passes `paramKey={param}` where `param` is already `'memory' | 'emotion' | 'translate' | 'otherAx'` from iterating `Object.keys(db.seperateParameters)`.

## How other providers handle model-specific parameters

### The general architecture

All providers share a common parameter resolution layer in `shared.ts`:

```
applyParameters(bodyTemplate, parameterList, renameMap, modelMode, arg)
```

`modelMode` is typed as `ModelModeExtended = 'model' | 'submodel' | 'memory' | 'emotion' | 'otherAx' | 'translate'`. The function checks if separate parameters are enabled, looks up the right `SeparateParameters` object from `db.seperateParameters[modelMode]`, and applies each parameter value into the request body.

This is the *backend/request-time* equivalent of what we just refactored on the *UI side*. Notably, `applyParameters` handles standard numeric parameters (temperature, top_k, etc.) through a unified loop. But model-specific *structural* differences (like Claude's thinking blocks or Gemini's thinkingConfig) are handled individually by each provider after `applyParameters` runs.

### Claude (anthropic.ts)

After `applyParameters` injects `thinking.budget_tokens` into the body, `anthropic.ts` post-processes it:

```ts
if (db.thinkingType === 'adaptive') {
    body.thinking = { type: 'adaptive', display: 'summarized' }
    body.output_config = { effort }
} else if (body?.thinking?.budget_tokens > 0) {
    body.thinking.type = 'enabled'
    body.thinking.display = 'summarized'
}
```

The thinking type and effort come from *global* DB state (`db.thinkingType`, `db.adaptiveThinkingEffort`), not from `SeparateParameters`. The per-context `SeparateParameters` only carries `thinking_tokens` (budget) and `thinking_type`/`adaptive_thinking_effort` for the UI; the actual request construction reads global state. This is a known asymmetry - the UI lets you configure per-context thinking settings, but `anthropic.ts` doesn't read them yet.

### Google/Gemini (google.ts)

Gemini thinking is configured structurally differently per model generation:

```ts
if (/^gemini-3-/.test(internalId)) {
    // Gemini 3: thinkingLevel enum (LOW/MEDIUM/HIGH)
    body.generation_config.thinkingConfig = { thinkingLevel, includeThoughts: true }
} else {
    // Gemini 2.5: numeric thinkingBudget
    body.generation_config.thinkingConfig = { thinkingBudget, includeThoughts: true }
}
```

The `thinking_tokens` value from `applyParameters` is translated into the provider-specific structure. Like Claude, this is a post-processing step after the shared parameter layer.

### OpenAI-compatible (openAI/requests.ts)

OpenAI models use `reasoning_effort` (a string like `"low"`, `"medium"`, `"high"`). This is handled entirely through `applyParameters` via the shared `reasoning_effort` parameter - no post-processing needed since it maps directly to an API field.

### Summary of the pattern

| Layer | What it handles | Where |
|-------|----------------|-------|
| `applyParameters()` (shared) | Numeric/string params that map 1:1 to API fields | `shared.ts` |
| Provider post-processing | Structural transforms (thinking blocks, thinkingConfig) | `anthropic.ts`, `google.ts` |
| UI components | Model-aware display logic (show/hide options based on flags) | `ClaudeThinkingSeparateParams.svelte` |

The `paramKey` refactor aligns the UI layer with how the backend already works: the *key* (model mode) is the primary identifier, and the actual model ID is resolved from it when needed.
