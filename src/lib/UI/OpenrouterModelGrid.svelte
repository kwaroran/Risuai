<script lang="ts">
    import type { OpenRouterModelInfo } from 'src/ts/model/openrouter'
    import { language } from 'src/lang'
    import TextInput from './GUI/TextInput.svelte'

    interface Props {
        value?: string
        models?: OpenRouterModelInfo[]
        loading?: boolean
    }

    let { value = $bindable(''), models = [], loading = false }: Props = $props()

    type PinnedModel = { id: string; cleanName: string; provider: string; priceDisplay: string }

    const pinnedModels: PinnedModel[] = [
        { id: 'risu/free',        cleanName: 'Free Auto',        provider: 'Risu',        priceDisplay: 'Free'   },
        { id: 'openrouter/auto',  cleanName: 'OpenRouter Auto',  provider: 'OpenRouter',  priceDisplay: 'Varies' },
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
        if (length >= 1_000_000) return `${(length / 1_000_000).toFixed(0)}M ctx`
        return `${Math.round(length / 1000)}k ctx`
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
    <div class="h-72 overflow-y-auto rounded-lg border border-darkborderc bg-bgcolor">
        {#if loading}
            <div class="flex h-full items-center justify-center">
                <span class="text-sm text-textcolor2">{language.loading}…</span>
            </div>
        {:else}
            <div class="grid grid-cols-2 gap-2 p-2">
                <!-- Pinned special models (always visible, not filtered) -->
                {#each pinnedModels as pinned}
                    <button
                        onclick={() => { value = pinned.id }}
                        class="flex cursor-pointer flex-col gap-0.5 rounded-md border p-2.5 text-left transition-colors {value === pinned.id ? 'border-selected bg-selected' : 'border-darkborderc hover:bg-selected'}"
                    >
                        <span class="text-xs text-textcolor2">{pinned.provider}</span>
                        <span class="text-sm font-semibold leading-tight text-textcolor">{pinned.cleanName}</span>
                        <span class="mt-1 text-xs text-textcolor2">{pinned.priceDisplay}</span>
                    </button>
                {/each}

                {#if models.length === 0}
                    <!-- API call failed or key not set -->
                    <p class="col-span-2 py-4 text-center text-sm text-textcolor2">
                        Could not load model list. Check your API key.
                    </p>
                {:else if filteredModels.length === 0}
                    <p class="col-span-2 py-4 text-center text-sm text-textcolor2">
                        No models match "<span class="text-textcolor">{searchQuery}</span>"
                    </p>
                {:else}
                    {#each filteredModels as model}
                        <button
                            onclick={() => { value = model.id }}
                            class="flex cursor-pointer flex-col gap-0.5 rounded-md border p-2.5 text-left transition-colors {value === model.id ? 'border-selected bg-selected' : 'border-darkborderc hover:bg-selected'}"
                        >
                            <span class="text-xs text-textcolor2">{model.provider}</span>
                            <span class="line-clamp-2 text-sm font-medium leading-snug text-textcolor">{model.cleanName}</span>
                            <div class="mt-auto flex flex-wrap items-center gap-x-1 pt-1">
                                <span class="text-xs text-textcolor2">{model.priceDisplay}</span>
                                {#if model.context_length > 0}
                                    <span class="text-xs text-textcolor2">· {formatContext(model.context_length)}</span>
                                {/if}
                            </div>
                        </button>
                    {/each}
                {/if}
            </div>
        {/if}
    </div>
</div>
