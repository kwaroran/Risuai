<script lang="ts">
    import type { OpenRouterModelInfo, PriceEntry } from 'src/ts/model/openrouter'
    import { language } from 'src/lang'
    import TextInput from './GUI/TextInput.svelte'

    interface Props {
        value?: string
        models?: OpenRouterModelInfo[]
        loading?: boolean
    }

    let { value = $bindable(''), models = [], loading = false }: Props = $props()

    type PinnedModel = { id: string; cleanName: string; provider: string }

    const pinnedModels: PinnedModel[] = [
        { id: 'risu/free',        cleanName: 'Free Auto',        provider: 'Risu'        },
        { id: 'openrouter/auto',  cleanName: 'OpenRouter Auto',  provider: 'OpenRouter'  },
    ]

    let searchQuery = $state('')

    let filteredModels = $derived.by(() => {
        if (!searchQuery.trim()) return models
        const terms = searchQuery.trim().toLowerCase().split(/\s+/)
        return models.filter(m => {
            const text = (m.cleanName + ' ' + m.provider + ' ' + m.id).toLowerCase()
            return terms.every(t => text.includes(t))
        })
    })

    let selectedLabel = $derived.by(() => {
        const pinned = pinnedModels.find(p => p.id === value)
        if (pinned) return `${pinned.provider} / ${pinned.cleanName}`
        const model = models.find(m => m.id === value)
        if (model) return `${model.provider} / ${model.cleanName}`
        return value || '–'
    })

    function formatContext(length: number): string {
        if (!length) return ''
        if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(0)}M`
        return `${Math.round(length / 1000)}k`
    }

    /** Format a per-1M-token price. Returns null if price is undefined. */
    function fmt(p: PriceEntry): string | null {
        if (p === undefined) return null
        if (p === 0) return 'Free'
        return `$${p.toFixed(2)}`
    }
</script>

<div class="mt-2 mb-4 flex flex-col gap-2">
    <!-- Current selection indicator -->
    <p class="text-xs text-textcolor2">
        {language.model}: <span class="font-medium text-textcolor">{selectedLabel}</span>
    </p>

    <!-- Search bar (only meaningful when list is loaded) -->
    {#if !loading && models.length > 0}
        <TextInput bind:value={searchQuery} placeholder={language.openRouterSearchModel} size="sm" />
    {/if}

    <!-- Fixed-height scrollable grid container -->
    <div class="h-80 overflow-y-auto rounded-lg border border-darkborderc bg-bgcolor">
        {#if loading}
            <div class="flex h-full items-center justify-center">
                <span class="text-sm text-textcolor2">{language.loading}…</span>
            </div>
        {:else}
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-2">
                <!-- Pinned special models (always visible, not filtered) -->
                {#each pinnedModels as pinned}
                    <button
                        onclick={() => { value = pinned.id }}
                        class="flex cursor-pointer flex-col rounded-md border p-2.5 text-left transition-colors {value === pinned.id ? 'border-selected bg-selected' : 'border-darkborderc hover:bg-selected'}"
                    >
                        <span class="text-xs text-textcolor2">{pinned.provider}</span>
                        <span class="text-sm font-semibold leading-tight text-textcolor">{pinned.cleanName}</span>
                    </button>
                {/each}

                {#if models.length === 0}
                    <p class="col-span-2 py-4 text-center text-sm text-textcolor2">
                        Could not load model list. Check your API key.
                    </p>
                {:else if filteredModels.length === 0}
                    <p class="col-span-2 py-4 text-center text-sm text-textcolor2">
                        No models match "<span class="text-textcolor">{searchQuery}</span>"
                    </p>
                {:else}
                    {#each filteredModels as model}
                        {@const inputFmt = fmt(model.promptPrice1M)}
                        {@const outputFmt = fmt(model.completionPrice1M)}
                        {@const cacheReadFmt = fmt(model.cacheReadPrice1M)}
                        {@const cacheWriteFmt = fmt(model.cacheWritePrice1M)}
                        {@const reasoningFmt = fmt(model.internalReasoningPrice1M)}
                        <button
                            onclick={() => { value = model.id }}
                            class="flex cursor-pointer flex-col rounded-md border p-2.5 text-left transition-colors {value === model.id ? 'border-selected bg-selected' : 'border-darkborderc hover:bg-selected'}"
                        >
                            <!-- Provider + name -->
                            <span class="text-xs text-textcolor2">{model.provider}</span>
                            <span class="line-clamp-2 text-sm font-medium leading-snug text-textcolor">{model.cleanName}</span>

                            <!-- Description -->
                            {#if model.description}
                                <span class="mt-1 line-clamp-2 text-xs leading-snug text-textcolor2">{model.description}</span>
                            {/if}

                            <!-- Pricing table -->
                            <div class="mt-1.5 flex flex-col gap-0.5 text-xs text-textcolor2">
                                {#if inputFmt !== null}
                                    <span>In: <span class="text-textcolor">{inputFmt}</span>/1M</span>
                                {/if}
                                {#if outputFmt !== null}
                                    <span>Out: <span class="text-textcolor">{outputFmt}</span>/1M</span>
                                {/if}
                                {#if cacheReadFmt !== null}
                                    <span>Cache In: <span class="text-textcolor">{cacheReadFmt}</span>/1M</span>
                                {/if}
                                {#if cacheWriteFmt !== null}
                                    <span>Cache Out: <span class="text-textcolor">{cacheWriteFmt}</span>/1M</span>
                                {/if}
                                {#if reasoningFmt !== null}
                                    <span>Reasoning: <span class="text-textcolor">{reasoningFmt}</span>/1M</span>
                                {/if}
                            </div>

                            <!-- Context length -->
                            {#if model.context_length > 0}
                                <span class="mt-1 text-xs text-textcolor2">Context: {formatContext(model.context_length)}</span>
                            {/if}
                        </button>
                    {/each}
                {/if}
            </div>
        {/if}
    </div>
</div>
