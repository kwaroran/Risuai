<script lang="ts">
    import type { language } from "src/lang";
    import Help from "../Others/Help.svelte";

    let open = $state(false)
    interface Props {
        name?: string;
        styled?: boolean;
        help?: (keyof (typeof language.help))|'';
        disabled?: boolean;
        children?: import('svelte').Snippet;
        className?: string;
    }

    let {
        name = "",
        styled = false,
        help = '',
        disabled = false,
        children,
        className = ""
    }: Props = $props();
</script>
{#if disabled}
    {@render children?.()}
{:else if styled}
    <div class="flex flex-col mt-2 risu-accordion">
        <button class="hover:bg-selected px-6 py-2 text-lg rounded-t-md border-selected border risu-accordion-head"
            class:bg-selected={open}
            aria-expanded={open}
            class:rounded-b-md={!open}
            onclick={() => {
                open = !open
            }}
        >
            <span class="mr-2">{name}</span>
        {#if help}
            <Help key={help} />
        {/if}</button>
        {#if open}
            <div class={"flex flex-col border border-selected p-2 rounded-b-md risu-accordion-body " + className}>
                {@render children?.()}
            </div>
        {/if}
    </div>
{:else}
    <div class="flex flex-col risu-accordion-plain">
        <button class="hover:bg-selected px-6 py-2 text-lg risu-accordion-plain-head" class:bg-selected={open} aria-expanded={open} onclick={() => {
            open = !open
        }}>{name}</button>
        {#if open}
            <div class="flex flex-col bg-darkbg risu-accordion-plain-body">
                {@render children?.()}
            </div>
        {/if}
    </div>
{/if}