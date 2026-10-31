<script lang="ts">
    import { ArrowDown, ArrowUp, ArrowUpDownIcon, GripVerticalIcon, XIcon } from "@lucide/svelte";
    import { onDestroy, onMount } from "svelte";
    import Sortable from 'sortablejs';
    import { language } from "src/lang";
    import { DBState } from "src/ts/stores.svelte";
    import { loadPlugins, type RisuPlugin } from "src/ts/plugins/plugins.svelte";
    import { sortableOptions } from "src/ts/util";
    import Button from "../UI/GUI/Button.svelte";

    interface Props {
        onclose: () => void;
    }

    let { onclose }: Props = $props();

    // V2 plugins always load before V3 ones, so only the V3 order can be changed.
    const isPinned = (p: RisuPlugin) => p.version === 2 || p.version === '2.1'
    const isMovable = (p: RisuPlugin) => p.version === '3.0'

    const original: RisuPlugin[] = DBState.db.plugins ?? []
    const pinned = original.filter(isPinned)
    const originalMovable = original.filter(isMovable)

    // The order is staged here and only written to the database on Apply, so Cancel changes nothing.
    let movable: RisuPlugin[] = $state.raw([...originalMovable])
    let listElement: HTMLDivElement = $state()
    let sortable: Sortable = null
    let startNextNode: Node = null
    let pressedBackdrop = false

    const changed = $derived(movable.some((p, i) => p.name !== originalMovable[i].name))

    onMount(() => {
        sortable = Sortable.create(listElement, {
            ...sortableOptions,
            // Shorter touch hold than the shared 300ms.
            delay: 70,
            // Arrow taps must not start a drag; preventOnFilter: false keeps their click.
            filter: '.no-sort, button',
            preventOnFilter: false,
            animation: 150,
            // No browser drag image; the row itself moves.
            forceFallback: true,
            fallbackOnBody: true,
            fallbackTolerance: 3,
            fallbackClass: 'plugin-order-fallback',
            ghostClass: 'plugin-order-ghost',
            chosenClass: 'plugin-order-chosen',
            onStart: (evt) => {
                // A node rather than an index: the last row must stay before Svelte's list anchor.
                startNextNode = evt.item.nextSibling
            },
            onEnd: (evt) => {
                if(evt.oldIndex === evt.newIndex){
                    return
                }
                // Cancel the slide animation and put the row back, so Svelte is the only one moving DOM nodes.
                for(const child of Array.from(evt.from.children) as HTMLElement[]){
                    child.style.transform = ''
                    child.style.transition = ''
                }
                evt.from.insertBefore(evt.item, startNextNode)
                move(evt.oldIndex, evt.newIndex)
            },
        })
    })

    onDestroy(() => {
        sortable?.destroy()
    })

    function move(from: number, to: number){
        const next = [...movable]
        const [plugin] = next.splice(from, 1)
        next.splice(to, 0, plugin)
        movable = next
    }

    function apply(){
        if(changed){
            // Rebuild from the current list by name, so plugins changed while this window was open (e.g. by hot reload) are kept.
            const current: RisuPlugin[] = DBState.db.plugins ?? []
            const currentMovable = current.filter(isMovable)
            const order = movable.map((p) => p.name)
            const sorted = order.map((name) => currentMovable.find((p) => p.name === name)).filter((p) => p)
            const added = currentMovable.filter((p) => !order.includes(p.name))
            DBState.db.plugins = [
                ...current.filter(isPinned),
                ...sorted,
                ...added,
                ...current.filter((p) => !isPinned(p) && !isMovable(p)),
            ]
            loadPlugins()
        }
        onclose()
    }
</script>

{#snippet badge(text: string)}
    <span class="shrink-0 px-2 py-0.5 rounded text-xs font-medium bg-textcolor/10 text-textcolor/60">{text}</span>
{/snippet}

{#snippet row(plugin: RisuPlugin, index?: number)}
    {@const isPinnedRow = index === undefined}
    <div
        class="flex items-center gap-2 px-3 py-2 rounded-md border border-darkborderc bg-textcolor/5 {isPinnedRow ? '' : 'cursor-grab hover:bg-textcolor/10'} transition-colors"
        class:opacity-50={!plugin.enabled}
    >
        {#if isPinnedRow}
            <span class="shrink-0 w-11"></span>
        {:else}
            <GripVerticalIcon size={16} class="shrink-0 text-textcolor2" />
            <span class="plugin-order-number shrink-0 w-5 text-center text-sm text-textcolor2"></span>
        {/if}
        <span class="flex-1 min-w-0 truncate text-sm text-textcolor">{plugin.displayName ?? plugin.name}</span>
        {#if isPinnedRow}
            {@render badge(plugin.version === 2 ? 'V2' : '2.1')}
        {/if}
        {#if !plugin.enabled}
            {@render badge(language.disabled)}
        {/if}
        {#if !isPinnedRow}
            <button
                class="plugin-order-up shrink-0 p-1 text-textcolor2 hover:text-textcolor transition-colors"
                disabled={index === 0}
                aria-label="Move up"
                onclick={() => move(index, index - 1)}
            >
                <ArrowUp size={16} />
            </button>
            <button
                class="plugin-order-down shrink-0 p-1 text-textcolor2 hover:text-textcolor transition-colors"
                disabled={index === movable.length - 1}
                aria-label="Move down"
                onclick={() => move(index, index + 1)}
            >
                <ArrowDown size={16} />
            </button>
        {/if}
    </div>
{/snippet}

<!-- Close only when the press also started on the backdrop; a drag released outside the window would otherwise close it. -->
<div
    class="fixed inset-0 z-50 bg-black/60 flex justify-center items-center p-4"
    role="presentation"
    onpointerdown={(e) => {
        pressedBackdrop = e.target === e.currentTarget
    }}
    onclick={(e) => {
        if (pressedBackdrop && e.target === e.currentTarget) onclose();
    }}
>
    <div class="bg-darkbg rounded-lg flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden shadow-xl">
        <div class="flex items-center justify-between gap-2 px-5 py-3 border-b border-textcolor/10 shrink-0">
            <span class="flex items-center gap-2 min-w-0 text-base font-semibold text-textcolor/90">
                <ArrowUpDownIcon size={18} class="shrink-0" />
                <span class="truncate">{language.pluginLoadOrder}</span>
            </span>
            <button
                class="text-textcolor/50 hover:text-textcolor/90 transition-colors"
                onclick={onclose}
                aria-label="Close"
            >
                <XIcon size={18} />
            </button>
        </div>

        <div class="overflow-y-auto flex-1 px-5 py-4 flex flex-col gap-3 break-any">
            <p class="text-sm text-textcolor/70">{language.pluginLoadOrderDesc}</p>
            {#if pinned.length > 0}
                <div class="flex flex-col gap-1.5">
                    <span class="text-xs text-textcolor2">{language.pluginLoadOrderPinned}</span>
                    {#each pinned as plugin}
                        {@render row(plugin)}
                    {/each}
                </div>
            {/if}
            <div class="plugin-order-list flex flex-col gap-1.5" bind:this={listElement}>
                {#each movable as plugin, i (plugin)}
                    {@render row(plugin, i)}
                {/each}
            </div>
        </div>

        <div class="flex items-center justify-end gap-2 px-5 py-3 border-t border-textcolor/10 shrink-0">
            <Button styled="outlined" size="sm" onclick={onclose}>{language.cancel}</Button>
            <Button size="sm" onclick={apply} disabled={!changed}>{language.apply}</Button>
        </div>
    </div>
</div>

<style>
    :global(.plugin-order-fallback) {
        opacity: 0 !important;
    }

    :global(.plugin-order-ghost) {
        background-color: var(--risu-theme-selected);
        border-color: var(--risu-theme-borderc);
    }

    /* Touch only: a mouse has no delay, so this would flash on every arrow click. */
    @media (pointer: coarse) {
        :global(.plugin-order-chosen) {
            background-color: var(--risu-theme-selected);
            border-color: var(--risu-theme-borderc);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
        }
    }

    /* Numbered by CSS so the numbers follow the rows during a drag. */
    .plugin-order-list {
        counter-reset: plugin-order;
    }

    .plugin-order-list > :global(div) {
        counter-increment: plugin-order;
    }

    .plugin-order-number::before {
        content: counter(plugin-order);
    }

    /* Dimmed by position for the same reason, instead of by the disabled state. */
    .plugin-order-list > div:first-child .plugin-order-up,
    .plugin-order-list > div:last-child .plugin-order-down {
        opacity: 0.3;
    }
</style>
