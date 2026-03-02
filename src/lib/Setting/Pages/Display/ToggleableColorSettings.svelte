<script lang="ts">
    import type { Database } from "src/ts/storage/database.svelte";
    import { DBState } from "src/ts/stores.svelte";
    import Check from "src/lib/UI/GUI/CheckInput.svelte";
    import { language } from "src/lang";

    interface Props {
        bindKey: keyof Database;
        labelKey: string;
    }

    let { bindKey, labelKey }: Props = $props();
</script>

{#if (DBState.db as any)[bindKey]}
    <div class="flex items-center mt-2">
        <Check check={true} onChange={() => {
            (DBState.db as any)[bindKey] = null
        }} name={language[labelKey as any]} hiddenName/>
        <input type="color" class="style2 text-sm mr-2" bind:value={(DBState.db as any)[bindKey]} >
        <span>{language[labelKey as any]}</span>
    </div>
{:else}
    <div class="flex items-center mt-2">
        <Check check={false} onChange={() => {
            (DBState.db as any)[bindKey] = "#121212"
        }} name={language[labelKey as any]}/>
    </div>
{/if}
