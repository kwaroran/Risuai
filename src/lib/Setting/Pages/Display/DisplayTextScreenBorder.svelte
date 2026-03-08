<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import { language } from 'src/lang';
    import Check from 'src/lib/UI/GUI/CheckInput.svelte';
</script>

{#if DBState.db.textScreenBorder}
    <div class="flex items-center mt-2">
        <Check check={true} onChange={() => {
            DBState.db.textScreenBorder = null
        }} name={language.textScreenBorder} hiddenName/>
        <input type="color" class="style2 text-sm mr-2" bind:value={DBState.db.textScreenBorder} >
        <span>{language.textScreenBorder}</span>
    </div>
{:else}
    <div class="flex items-center mt-2">
        <Check check={false} onChange={() => {
            DBState.db.textScreenBorder = "#121212"
        }} name={language.textScreenBorder}/>
    </div>
{/if}
