<script lang="ts">
    import { getNanoGPTModelProviders } from 'src/ts/model/nanogpt'
    import type { NanoGPTModelProviders } from 'src/ts/model/nanogpt'

    interface Props {
        apiKey: string
        modelId: string
        value: string
    }

    let { apiKey, modelId, value = $bindable('') }: Props = $props()

    let providersPromise = $derived(
        apiKey && modelId
            ? getNanoGPTModelProviders(apiKey, modelId)
            : Promise.resolve<NanoGPTModelProviders | null>(null)
    )

    function fmtPrice(per1k: number): string {
        if (per1k === 0) return 'Free'
        // Convert per-1k to per-1M for display
        const per1M = per1k * 1000
        return `$${per1M.toFixed(2)}`
    }
</script>

{#await providersPromise then data}
    {#if data && data.supportsProviderSelection && data.providers.length > 0}
        <div class="mt-2 flex flex-col gap-1.5">
            <span class="text-sm text-textcolor2">Provider</span>
            <div class="flex flex-wrap gap-1.5">
                <!-- Default (auto) option -->
                <button
                    onclick={() => { value = '' }}
                    class="flex flex-col rounded-md border px-3 py-1.5 text-left text-xs transition-colors {value === '' ? 'border-selected bg-selected text-white' : 'border-darkborderc text-textcolor hover:bg-selected'}"
                >
                    <span class="font-medium">Auto</span>
                    <span class="text-[0.65rem] opacity-75">In: {fmtPrice(data.defaultPrice.inputPer1kTokens)}/1M · Out: {fmtPrice(data.defaultPrice.outputPer1kTokens)}/1M</span>
                </button>

                {#each data.providers.filter(p => p.available) as p}
                    <button
                        onclick={() => { value = p.provider }}
                        class="flex flex-col rounded-md border px-3 py-1.5 text-left text-xs transition-colors {value === p.provider ? 'border-selected bg-selected text-white' : 'border-darkborderc text-textcolor hover:bg-selected'}"
                    >
                        <span class="font-medium">{p.provider}</span>
                        <span class="text-[0.65rem] opacity-75">In: {fmtPrice(p.pricing.inputPer1kTokens)}/1M · Out: {fmtPrice(p.pricing.outputPer1kTokens)}/1M</span>
                    </button>
                {/each}
            </div>
        </div>
    {/if}
{/await}
