<script lang="ts">
    import { language } from 'src/lang';
    import { DBState } from 'src/ts/stores.svelte';
    import Check from 'src/lib/UI/GUI/CheckInput.svelte';

    interface Props {
        field: 'textScreenColor' | 'textScreenBorder';
        labelKey: 'textBackgrounds' | 'textScreenBorder';
        defaultColor: string;
    }

    let { field, labelKey, defaultColor }: Props = $props();
    let currentValue = $derived(DBState.db[field]);
</script>

{#if currentValue}
    <div class="flex items-center mt-2">
        <Check
            check={true}
            onChange={() => {
                DBState.db[field] = null;
            }}
            name={language[labelKey]}
            hiddenName
        />
        <input
            type="color"
            class="style2 text-sm mr-2"
            value={currentValue}
            oninput={(e) => {
                DBState.db[field] = e.currentTarget.value;
            }}
        />
        <span>{language[labelKey]}</span>
    </div>
{:else}
    <div class="flex items-center mt-2">
        <Check
            check={false}
            onChange={() => {
                DBState.db[field] = defaultColor;
            }}
            name={language[labelKey]}
        />
    </div>
{/if}
