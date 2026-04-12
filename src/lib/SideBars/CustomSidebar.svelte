<script lang="ts">
    import { Cog } from '@lucide/svelte'

    let customSideBarConfigOpen = $state(false)
</script>

<div class="border-darkborderc p-2 border rounded-sm flex flex-col items-start mt-2">
    <button>
        <Cog />
    </button>
</div>

{#if customSideBarConfigOpen}
    <div class="border-darkborderc p-2 border rounded-sm flex flex-col items-start mt-2">
        Custom sidebar configuration goes here.
    </div>
{/if}