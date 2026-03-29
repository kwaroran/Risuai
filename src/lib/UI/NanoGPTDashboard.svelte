<script lang="ts">
    import { getNanoGPTBalance, getNanoGPTSubscription } from 'src/ts/model/nanogpt'
    import type { NanoGPTBalance, NanoGPTSubscriptionUsage } from 'src/ts/model/nanogpt'

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
        const [
            // balance,  // TODO: CORS issue — NanoGPT's /api/check-balance does not set
            //           // Access-Control-Allow-Origin, so browser blocks the request.
            //           // Disabled until NanoGPT fixes CORS on that endpoint.
            subscription,
        ] = await Promise.all([
            // getNanoGPTBalance(key),
            getNanoGPTSubscription(key),
        ])
        return { balance: null, subscription }
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
        if (v >= 0.9) return 'bg-red-500'
        if (v >= 0.7) return 'bg-yellow-400'
        return 'bg-selected'
    }

    function stateColor(state: string): string {
        if (state === 'active') return 'bg-green-500'
        if (state === 'grace')  return 'bg-yellow-500'
        return 'bg-zinc-500'
    }
</script>

{#if apiKey}
    {#await dashboardPromise}
        <div class="mt-3 mb-2 flex items-center gap-2 text-sm text-textcolor2">
            <span class="animate-pulse">●</span>
            <span>Loading account info…</span>
        </div>
    {:then { balance, subscription }}
        {#if balance || subscription}
        <div class="mt-3 mb-2 flex flex-col gap-3 rounded-lg border border-darkborderc bg-bgcolor p-3 text-sm">

            <!-- Balance -->
            {#if balance}
                <div class="flex items-center justify-between">
                    <span class="text-textcolor2">Credit Balance</span>
                    <span class="font-semibold text-textcolor">{fmtUSD(balance.usd_balance)}</span>
                </div>
            {/if}

            {#if subscription}
                <!-- State badge row -->
                <div class="flex items-center gap-2">
                    <span class="text-textcolor2">Subscription</span>
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold text-white {stateColor(subscription.state)}">
                        {subscription.state.toUpperCase()}
                    </span>
                    {#if subscription.state === 'grace' && subscription.graceUntil}
                        <span class="text-xs text-textcolor2">until {fmtDate(subscription.graceUntil)}</span>
                    {/if}
                </div>

                {#if subscription.state === 'inactive'}
                    <p class="text-xs text-textcolor2">No active subscription.</p>
                {:else}
                    {#if subscription.cancelAtPeriodEnd}
                        <p class="text-xs text-yellow-400">Cancels at period end ({fmtDate(subscription.period?.currentPeriodEnd)})</p>
                    {/if}

                <!-- Weekly input tokens -->
                {#if subscription.weeklyInputTokens}
                    {@const w = subscription.weeklyInputTokens}
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-xs text-textcolor2">
                            <span>Weekly Included Input Tokens — {pct(w.percentUsed)} used</span>
                            <span>Resets {fmtReset(w.resetAt)}</span>
                        </div>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                            <div class="h-full rounded-full transition-all {barColor(w.percentUsed)}" style="width: {pct(w.percentUsed)}"></div>
                        </div>
                        <div class="flex justify-between text-xs text-textcolor2">
                            <span>{fmtTokens(w.used)} used</span>
                            <span>{fmtTokens(w.remaining)} remaining</span>
                        </div>
                    </div>
                {/if}

                <!-- Daily input tokens -->
                {#if subscription.dailyInputTokens}
                    {@const d = subscription.dailyInputTokens}
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-xs text-textcolor2">
                            <span>Daily Included Input Tokens — {pct(d.percentUsed)} used</span>
                            <span>Resets {fmtReset(d.resetAt)}</span>
                        </div>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                            <div class="h-full rounded-full transition-all {barColor(d.percentUsed)}" style="width: {pct(d.percentUsed)}"></div>
                        </div>
                        <div class="flex justify-between text-xs text-textcolor2">
                            <span>{fmtTokens(d.used)} used</span>
                            <span>{fmtTokens(d.remaining)} remaining</span>
                        </div>
                    </div>
                {/if}

                <!-- Daily images -->
                {#if subscription.dailyImages}
                    {@const img = subscription.dailyImages}
                    <div class="flex flex-col gap-1">
                        <div class="flex justify-between text-xs text-textcolor2">
                            <span>Daily Included Images — {pct(img.percentUsed)} used</span>
                            <span>Resets {fmtReset(img.resetAt)}</span>
                        </div>
                        <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                            <div class="h-full rounded-full transition-all {barColor(img.percentUsed)}" style="width: {pct(img.percentUsed)}"></div>
                        </div>
                        <div class="flex justify-between text-xs text-textcolor2">
                            <span>{img.used} used</span>
                            <span>{img.remaining} remaining</span>
                        </div>
                    </div>
                {/if}

                    <!-- Renews: at the bottom -->
                    {#if subscription.period}
                        <p class="text-xs text-textcolor2">Renews: {fmtDate(subscription.period.currentPeriodEnd)}</p>
                    {/if}
                {/if}
            {/if}

        </div>
        {/if}
    {:catch}
        <p class="mt-2 text-xs text-textcolor2">Could not load account info.</p>
    {/await}
{/if}
