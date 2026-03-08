<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import { language } from 'src/lang';
    import Check from 'src/lib/UI/GUI/CheckInput.svelte';
</script>

{#if DBState.db.textScreenColor}
    <div class="flex items-center mt-2">
        <Check check={true} onChange={() => {
            DBState.db.textScreenColor = null
        }} name={language.textBackgrounds} hiddenName/>
        <input type="color" class="style2 text-sm mr-2" bind:value={DBState.db.textScreenColor} >
        <span>{language.textBackgrounds}</span>
    </div>
{:else}
    <div class="flex items-center mt-2">
        <Check check={false} onChange={() => {
            DBState.db.textScreenColor = "#121212"
        }} name={language.textBackgrounds}/>
    </div>
{/if}
