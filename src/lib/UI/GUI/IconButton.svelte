
<script lang="ts">
    import type { Snippet } from "svelte";


    interface Props {
        children: Snippet;
        onclick: (e: MouseEvent) => void;
        name?: string
        className?: string;
        id?: string;
    }

    const { children, onclick, name, className }: Props = $props();
</script>

<button class={{
    "flex items-center hover:text-blue-500 transition-colors": true,
    [className]: !!className
}} id={id} onclick={onclick}>
    {@render children?.()}

    {#if name}
        <span class="ml-1">{name}</span>
    {/if}
</button>