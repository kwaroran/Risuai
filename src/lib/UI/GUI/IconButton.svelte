
<script lang="ts">
    import type { Snippet } from "svelte";


    interface Props {
        children: Snippet;
        onclick: (e: MouseEvent) => void;
    }
</script>

<button class="flex items-center hover:text-blue-500 transition-colors" onclick={onclick}>
    {@render children?.()}
</button>