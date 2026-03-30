<script lang="ts">
    import { getNanoGPTBalance, getNanoGPTSubscription } from 'src/ts/model/nanogpt'
    import type { NanoGPTBalance, NanoGPTSubscriptionUsage } from 'src/ts/model/nanogpt'
    import { getDatabase } from 'src/ts/storage/database.svelte'
    import { language } from 'src/lang'

    interface Props {
        apiKey: string
    }

    let { apiKey }: Props = $props()

    type DashboardData = {
        balance: NanoGPTBalance | null
        subscription: NanoGPTSubscriptionUsage | null
    }

    let dashboardPromise = $derived(
        apiKey ? fetchDashboard(apiKey) : Promise.resolve<DashboardData>({ balance: null, subscription: null })
    )

    async function fetchDashboard(key: string): Promise<DashboardData> {
        const [balance, subscription] = await Promise.all([
            getNanoGPTBalance(key),
            getNanoGPTSubscription(key),
        ])
        // Persist subscription state so chat requests can pick the right endpoint
        const db = getDatabase()
        db.nanogptSubscriptionState = subscription?.state ?? ''
        return { balance, subscription }
    }

    function fmtUSD(raw: string | undefined): string {
        const n = parseFloat(raw ?? '')
        return isNaN(n) ? '–' : `$${n.toFixed(4)}`
    }

    function fmtDate(iso: string | null | undefined): string {
        if (!iso) return '–'
        return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
    }

    function fmtReset(ms: number | undefined): string {
        if (!ms) return '–'
        return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' })
    }

    function fmtTokens(n: number): string {
        if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
        if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`
        return String(n)
    }

    function pct(v: number): string {
        return `${Math.round(v * 100)}%`
    }

    function barColor(v: number): string {
        if (v >= 0.8) return 'bg-red-600'
        if (v >= 0.6) return 'bg-yellow-600'
        return 'bg-green-600'
    }

    function stateColor(state: string): string {
        if (state === 'active') return 'bg-green-600'
        if (state === 'grace')  return 'bg-yellow-600'
        return 'bg-zinc-600'
    }
</script>

{#if apiKey}
    {#await dashboardPromise}
        <div class="mt-3 mb-2 flex items-center gap-2 text-sm text-textcolor">
            <span class="animate-pulse">●</span>
            <span>{language.nanoGPTLoadingAccountInfo}</span>
        </div>
    {:then { balance, subscription }}
        {#if balance || subscription}
        <div class="mt-3 mb-2 flex flex-col gap-3 rounded-lg border border-darkborderc bg-bgcolor p-3 text-sm">

            {#if balance}
                <div class="flex items-center gap-1.5">
                    <span class="text-textcolor">{language.nanoGPTCreditBalance}</span>
                    <span class="font-semibold text-textcolor">{fmtUSD(balance.usd_balance)}</span>
                </div>
            {/if}

            {#if balance && subscription}
                <hr class="border-darkborderc" />
            {/if}

            {#if subscription}
                <div class="flex items-center gap-2">
                    <span class="text-textcolor">{language.nanoGPTSubscription}</span>
                    <span class="inline-flex items-center justify-center rounded-full px-2.5 pb-[2px] pt-[4px] text-sm font-bold leading-none text-white {stateColor(subscription.state)}">
                        {subscription.state.toUpperCase()}
                    </span>
                    {#if subscription.state === 'grace' && subscription.graceUntil}
                        <span class="text-xs text-textcolor">{language.nanoGPTGraceUntil(fmtDate(subscription.graceUntil))}</span>
                    {/if}
                </div>

                {#if subscription.state === 'inactive'}
                    <p class="text-xs text-textcolor">{language.nanoGPTNoActiveSubscription}</p>
                {:else}
                    {#if subscription.cancelAtPeriodEnd}
                        <p class="text-xs text-yellow-400">{language.nanoGPTCancelsAtPeriodEnd(fmtDate(subscription.period?.currentPeriodEnd))}</p>
                    {/if}

                {#if subscription.weeklyInputTokens}
                    {@const w = subscription.weeklyInputTokens}
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-xs">
                            <span class="text-textcolor2">{language.nanoGPTWeeklyTokensLabel} — <span class="text-textcolor">{pct(w.percentUsed)}</span> {language.nanoGPTUsedLabel}</span>
                            <span class="text-textcolor2">{language.nanoGPTResetsLabel} <span class="text-textcolor">{fmtReset(w.resetAt)}</span></span>
                        </div>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                            <div class="h-full rounded-full transition-all {barColor(w.percentUsed)}" style="width: {pct(w.percentUsed)}"></div>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-textcolor2"><span class="text-textcolor">{fmtTokens(w.used)}</span> {language.nanoGPTUsedLabel}</span>
                            <span class="text-textcolor2"><span class="text-textcolor">{fmtTokens(w.remaining)}</span> {language.nanoGPTRemainingLabel}</span>
                        </div>
                    </div>
                {/if}

                {#if subscription.dailyInputTokens}
                    {@const d = subscription.dailyInputTokens}
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-xs">
                            <span class="text-textcolor2">{language.nanoGPTDailyTokensLabel} — <span class="text-textcolor">{pct(d.percentUsed)}</span> {language.nanoGPTUsedLabel}</span>
                            <span class="text-textcolor2">{language.nanoGPTResetsLabel} <span class="text-textcolor">{fmtReset(d.resetAt)}</span></span>
                        </div>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                            <div class="h-full rounded-full transition-all {barColor(d.percentUsed)}" style="width: {pct(d.percentUsed)}"></div>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-textcolor2"><span class="text-textcolor">{fmtTokens(d.used)}</span> {language.nanoGPTUsedLabel}</span>
                            <span class="text-textcolor2"><span class="text-textcolor">{fmtTokens(d.remaining)}</span> {language.nanoGPTRemainingLabel}</span>
                        </div>
                    </div>
                {/if}

                {#if subscription.dailyImages}
                    {@const img = subscription.dailyImages}
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-xs">
                            <span class="text-textcolor2">{language.nanoGPTDailyImagesLabel} — <span class="text-textcolor">{pct(img.percentUsed)}</span> {language.nanoGPTUsedLabel}</span>
                            <span class="text-textcolor2">{language.nanoGPTResetsLabel} <span class="text-textcolor">{fmtReset(img.resetAt)}</span></span>
                        </div>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                            <div class="h-full rounded-full transition-all {barColor(img.percentUsed)}" style="width: {pct(img.percentUsed)}"></div>
                        </div>
                        <div class="flex justify-between text-xs">
                            <span class="text-textcolor2"><span class="text-textcolor">{String(img.used)}</span> {language.nanoGPTUsedLabel}</span>
                            <span class="text-textcolor2"><span class="text-textcolor">{String(img.remaining)}</span> {language.nanoGPTRemainingLabel}</span>
                        </div>
                    </div>
                {/if}

                    {#if subscription.period}
                        <p class="text-xs text-textcolor2">{language.nanoGPTRenewsLabel} <span class="text-textcolor">{fmtDate(subscription.period.currentPeriodEnd)}</span></p>
                    {/if}
                {/if}
            {/if}

        </div>
        {/if}
    {:catch}
        <p class="mt-2 text-xs text-textcolor">{language.nanoGPTCouldNotLoadAccountInfo}</p>
    {/await}
{/if}
