<script lang="ts">
    import { getNanoGPTModelProviders } from 'src/ts/model/nanogpt'
    import type { NanoGPTModelProviders } from 'src/ts/model/nanogpt'
    import { language } from 'src/lang'

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
        if (per1k === 0) return language.nanoGPTProviderFree
        const per1M = per1k * 1000
        return `$${per1M.toFixed(2)}`
    }
</script>

{#await providersPromise then data}
    {#if data && data.supportsProviderSelection && data.providers.length > 0}
        <div class="mt-2 flex flex-col gap-1.5">
            <span class="text-textcolor mt-4">{language.nanoGPTProvider} <span class="text-sm opacity-60">{language.nanoGPTProviderPayAsYouGoOnly}</span></span>
            <div class="flex flex-wrap gap-1.5">
                <button
                    onclick={() => { value = '' }}
                    class="flex flex-col rounded-md border px-3 py-1.5 text-left text-xs transition-colors {value === '' ? 'border-selected bg-selected text-white' : 'border-darkborderc bg-darkbutton text-textcolor hover:bg-selected hover:text-white'}"
                >
                    <span class="{value === '' ? 'font-bold' : 'font-medium'}">{language.nanoGPTProviderAuto}</span>
                    <span class="text-[0.65rem] {value === '' ? 'opacity-90' : 'opacity-75'}">In: {fmtPrice(data.defaultPrice.inputPer1kTokens)}/1M · Out: {fmtPrice(data.defaultPrice.outputPer1kTokens)}/1M</span>
                </button>

                {#each data.providers.filter(p => p.available) as p}
                    <button
                        onclick={() => { value = p.provider }}
                        class="flex flex-col rounded-md border px-3 py-1.5 text-left text-xs transition-colors {value === p.provider ? 'border-selected bg-selected text-white' : 'border-darkborderc bg-darkbutton text-textcolor hover:bg-selected hover:text-white'}"
                    >
                        <span class="{value === p.provider ? 'font-bold' : 'font-medium'}">{p.provider}</span>
                        <span class="text-[0.65rem] {value === p.provider ? 'opacity-90' : 'opacity-75'}">In: {fmtPrice(p.pricing.inputPer1kTokens)}/1M · Out: {fmtPrice(p.pricing.outputPer1kTokens)}/1M</span>
                    </button>
                {/each}
            </div>
        </div>
    {/if}
{/await}
