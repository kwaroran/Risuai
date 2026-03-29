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
        const [balance, subscription] = await Promise.all([
            getNanoGPTBalance(key),
            getNanoGPTSubscription(key),
        ])
        return { balance, subscription }
    }

    function fmtUSD(raw: string | undefined): string {
        const n = parseFloat(raw ?? '')
        return isNaN(n) ? '–' : `$${n.toFixed(4)}`
    }

    function fmtDate(iso: string | null | undefined): string {
        if (!iso) return '–'
        return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    }

    function fmtReset(ms: number | undefined): string {
        if (!ms) return '–'
        return new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    }

    function stateColor(state: string): string {
        if (state === 'active') return 'bg-green-500'
        if (state === 'grace')  return 'bg-yellow-500'
        return 'bg-zinc-500'
    }

    function pct(v: number): string {
        return `${Math.round(v * 100)}%`
    }

    function barColor(v: number): string {
        if (v >= 0.9) return 'bg-red-500'
        if (v >= 0.7) return 'bg-yellow-400'
        return 'bg-selected'
    }
</script>

{#if apiKey}
    {#await dashboardPromise}
        <div class="mt-3 mb-2 flex items-center gap-2 text-sm text-textcolor2">
            <span class="animate-pulse">●</span>
            <span>Loading account info…</span>
        </div>
    {:then { balance, subscription }}
        <div class="mt-3 mb-2 flex flex-col gap-3 rounded-lg border border-darkborderc bg-bgcolor p-3 text-sm">

            <!-- Balance row -->
            <div class="flex items-center justify-between">
                <span class="text-textcolor2">Credit Balance</span>
                <span class="font-semibold text-textcolor">{fmtUSD(balance?.usd_balance)}</span>
            </div>

            {#if subscription}
                <!-- State badge -->
                <div class="flex items-center gap-2">
                    <span class="text-textcolor2">Subscription</span>
                    <span class="rounded-full px-2 py-0.5 text-xs font-medium text-white {stateColor(subscription.state)}">
                        {subscription.state}
                    </span>
                    {#if subscription.state === 'grace' && subscription.graceUntil}
                        <span class="text-xs text-textcolor2">until {fmtDate(subscription.graceUntil)}</span>
                    {/if}
                </div>

                <!-- Daily usage bar -->
                <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-xs text-textcolor2">
                        <span>Daily — {pct(subscription.daily.percentUsed)} used</span>
                        <span>Resets {fmtReset(subscription.daily.resetAt)}</span>
                    </div>
                    <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                        <div
                            class="h-full rounded-full transition-all {barColor(subscription.daily.percentUsed)}"
                            style="width: {pct(subscription.daily.percentUsed)}"
                        ></div>
                    </div>
                    <div class="flex justify-between text-xs text-textcolor2">
                        <span>{subscription.daily.used.toLocaleString()} used</span>
                        <span>{subscription.daily.remaining.toLocaleString()} remaining</span>
                    </div>
                </div>

                <!-- Monthly usage bar -->
                <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-xs text-textcolor2">
                        <span>Monthly — {pct(subscription.monthly.percentUsed)} used</span>
                        <span>Resets {fmtReset(subscription.monthly.resetAt)}</span>
                    </div>
                    <div class="h-2 w-full overflow-hidden rounded-full bg-darkbutton">
                        <div
                            class="h-full rounded-full transition-all {barColor(subscription.monthly.percentUsed)}"
                            style="width: {pct(subscription.monthly.percentUsed)}"
                        ></div>
                    </div>
                    <div class="flex justify-between text-xs text-textcolor2">
                        <span>{subscription.monthly.used.toLocaleString()} used</span>
                        <span>{subscription.monthly.remaining.toLocaleString()} remaining</span>
                    </div>
                </div>

                <!-- Billing period end -->
                <div class="flex items-center justify-between text-xs text-textcolor2">
                    <span>Billing period ends</span>
                    <span>{fmtDate(subscription.period.currentPeriodEnd)}</span>
                </div>
            {/if}
        </div>
    {:catch}
        <p class="mt-2 text-xs text-textcolor2">Could not load account info.</p>
    {/await}
{/if}
