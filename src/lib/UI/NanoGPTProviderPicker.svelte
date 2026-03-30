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

    function fmtTps(tps: number): string {
        return `${Math.round(tps)}`
    }

    function fmtTtft(ms: number): string {
        return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`
    }

    function discountBadge(pct: number, dir: 'less' | 'more'): { label: string; cls: string } | null {
        if (Math.abs(pct) < 0.5) return null
        if (dir === 'less') return { label: `↓${Math.round(pct)}%`, cls: 'bg-green-700 text-white' }
        return { label: `↑${Math.round(Math.abs(pct))}%`, cls: 'bg-red-700 text-white' }
    }
</script>

{#await providersPromise then data}
    {#if data && data.supportsProviderSelection && data.providers.length > 0}
        <div class="mt-2 flex flex-col gap-1.5">
            <span class="text-textcolor mt-4">{language.nanoGPTProvider} <span class="text-sm opacity-60">{language.nanoGPTProviderPayAsYouGoOnly}</span></span>
            <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                <!-- Auto button -->
                {#if true}
                {@const autoCmp = data.autoComparison}
                {@const autoInBadge = autoCmp ? discountBadge(autoCmp.platformVsOfficial.inputDiscountPct, autoCmp.platformVsOfficial.inputDirection) : null}
                {@const autoOutBadge = autoCmp ? discountBadge(autoCmp.platformVsOfficial.outputDiscountPct, autoCmp.platformVsOfficial.outputDirection) : null}
                <button
                    onclick={() => { value = '' }}
                    class="flex cursor-pointer flex-col rounded-md border p-2.5 text-left transition-colors {value === '' ? 'border-selected bg-selected' : 'border-darkborderc hover:bg-selected'}"
                >
                    <span class="text-sm font-medium leading-snug text-textcolor">{language.nanoGPTProviderAuto}</span>
                    <div class="mt-1.5 flex flex-col gap-0.5 text-xs text-textcolor2">
                        {#if data.autoTps}
                            <span>{fmtTps(data.autoTps)} t/s · {fmtTtft(data.autoTtftMs ?? 0)} TTFT</span>
                        {/if}
                        <span>{language.nanoGPTProviderInput}: <span class="text-textcolor">{fmtPrice(data.defaultPrice.inputPer1kTokens)}</span>/1M · {language.nanoGPTProviderOutput}: <span class="text-textcolor">{fmtPrice(data.defaultPrice.outputPer1kTokens)}</span>/1M</span>
                    </div>
                    {#if autoInBadge || autoOutBadge}
                        <div class="flex gap-1 mt-1.5">
                            {#if autoInBadge}
                                <span class="rounded px-1 text-xs font-bold leading-tight {autoInBadge.cls}">{autoInBadge.label} {language.nanoGPTProviderInput}</span>
                            {/if}
                            {#if autoOutBadge}
                                <span class="rounded px-1 text-xs font-bold leading-tight {autoOutBadge.cls}">{autoOutBadge.label} {language.nanoGPTProviderOutput}</span>
                            {/if}
                        </div>
                    {/if}
                </button>
                {/if}

                {#each data.providers.filter(p => p.available) as p}
                    {@const inBadge = p.comparison ? discountBadge(p.comparison.platformVsOfficial.inputDiscountPct, p.comparison.platformVsOfficial.inputDirection) : null}
                    {@const outBadge = p.comparison ? discountBadge(p.comparison.platformVsOfficial.outputDiscountPct, p.comparison.platformVsOfficial.outputDirection) : null}
                    <button
                        onclick={() => { value = p.provider }}
                        class="flex cursor-pointer flex-col rounded-md border p-2.5 text-left transition-colors {value === p.provider ? 'border-selected bg-selected' : 'border-darkborderc hover:bg-selected'}"
                    >
                        <span class="text-sm font-medium leading-snug text-textcolor">{p.provider}</span>
                        <div class="mt-1.5 flex flex-col gap-0.5 text-xs text-textcolor2">
                            <span>{language.nanoGPTProviderQuantization}: <span class="text-textcolor">{p.quantization && p.quantization !== 'unknown' ? p.quantization : language.nanoGPTProviderUndisclosed}</span></span>
                            <span>{language.nanoGPTProviderCache}: <span class="text-textcolor">{p.supportsPromptCaching ? language.nanoGPTProviderCacheSupported : language.nanoGPTProviderCacheNotSupported}</span></span>
                            <span>{language.nanoGPTProviderInput}: <span class="text-textcolor">{fmtPrice(p.pricing.inputPer1kTokens)}</span>/1M · {language.nanoGPTProviderOutput}: <span class="text-textcolor">{fmtPrice(p.pricing.outputPer1kTokens)}</span>/1M</span>
                            {#if p.pricing.cacheReadInputPer1kTokens}
                                <span>{language.nanoGPTProviderCacheRead}: <span class="text-textcolor">{fmtPrice(p.pricing.cacheReadInputPer1kTokens)}</span>/1M</span>
                            {/if}
                        </div>
                        {#if inBadge || outBadge}
                            <div class="flex gap-1 mt-1.5">
                                {#if inBadge}
                                    <span class="rounded px-1 text-xs font-bold leading-tight {inBadge.cls}">{inBadge.label} {language.nanoGPTProviderInput}</span>
                                {/if}
                                {#if outBadge}
                                    <span class="rounded px-1 text-xs font-bold leading-tight {outBadge.cls}">{outBadge.label} {language.nanoGPTProviderOutput}</span>
                                {/if}
                            </div>
                        {/if}
                    </button>
                {/each}
            </div>
        </div>
    {/if}
{/await}
