<script lang="ts">
    import { onMount } from 'svelte'
    import { language } from 'src/lang'
    import Button from 'src/lib/UI/GUI/Button.svelte'
    import { alertError } from 'src/ts/alert'
    import { forageStorage } from 'src/ts/globalApi.svelte'
    import { isNodeServer, isTauri } from 'src/ts/platform'
    import {
        getBrowserStorageEstimate,
        measureBrowserStorage,
        type BrowserStorageUsage,
    } from 'src/ts/storage/browserStorageUsage'

    let estimate = $state<StorageEstimate | null>(null)
    let usage = $state<BrowserStorageUsage | null>(null)
    let measuring = $state(false)

    const maxBytes = $derived(usage?.entries[0]?.bytes ?? 0)
    const description = forageStorage.isAccount || isNodeServer
        ? language.browserStorageDescServer
        : isTauri
          ? language.browserStorageDescTauri
          : language.browserStorageDesc

    function formatBytes(bytes: number) {
        const units = ['B', 'KB', 'MB', 'GB', 'TB']
        let size = bytes
        let unitIndex = 0
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024
            unitIndex += 1
        }
        return `${unitIndex === 0 ? size : size.toFixed(1)} ${units[unitIndex]}`
    }

    async function measure() {
        measuring = true
        try {
            const [nextUsage, nextEstimate] = await Promise.all([measureBrowserStorage(), getBrowserStorageEstimate()])
            usage = nextUsage
            estimate = nextEstimate
        } catch (error) {
            alertError(error)
        } finally {
            measuring = false
        }
    }

    onMount(async () => {
        estimate = await getBrowserStorageEstimate()
    })
</script>

<div class="bg-darkbg p-3 rounded-md mt-2 flex flex-col gap-2">
    <h3 class="text-xl font-bold">{language.browserStorage}</h3>
    <span class="text-sm text-textcolor2">{description}</span>
    {#if estimate?.usage !== undefined}
        <span>{language.browserStorageTotal(formatBytes(estimate.usage))}</span>
    {/if}
    {#if usage && usage.entries.length === 0}
        <span class="text-sm">{language.browserStorageEmpty}</span>
    {:else if usage}
        <div class="flex flex-col gap-2 mt-1">
            {#each usage.entries as entry (entry.category)}
                <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-sm">
                        <span>{language.browserStorageCategory[entry.category]}</span>
                        <span class="text-textcolor2">{formatBytes(entry.bytes)}</span>
                    </div>
                    <div class="h-1 w-full rounded-full bg-textcolor/5 overflow-hidden">
                        <div class="h-full bg-textcolor/40" style:width="{(entry.bytes / maxBytes) * 100}%"></div>
                    </div>
                </div>
            {/each}
        </div>
        <span class="text-xs text-textcolor2">{language.browserStorageMeasureNote}</span>
    {/if}
    {#if usage?.incomplete}
        <span class="text-xs text-textcolor2">{language.browserStorageIncomplete}</span>
    {/if}
    <Button className="self-start" disabled={measuring} size="sm" onclick={measure}>
        {measuring ? language.browserStorageMeasuring : language.browserStorageMeasure}
    </Button>
</div>
