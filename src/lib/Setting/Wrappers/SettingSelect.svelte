<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { UNINITIALIZED, getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import { untrack } from 'svelte';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';
    import Help from 'src/lib/Others/Help.svelte';
    import { language } from 'src/lang';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item, ctx }: Props = $props();

    let localValue: any = $state(untrack(() => getSettingValue(item, ctx)));

    // Sync: DB → local (one-way read)
    $effect(() => {
        localValue = getSettingValue(item, ctx);
    });

    // Write-back: local → DB (guarded — only fires on actual user changes)
    $effect(() => {
        const val = localValue;
        if (val === UNINITIALIZED) return;
        untrack(() => {
            if (val !== getSettingValue(item, ctx)) {
                setSettingValue(item, val, ctx);
            }
        });
    });

    // Process options to support labelKey translation and conditional rendering
    let processedOptions = $derived((item.options?.selectOptions ?? []).filter(opt => !opt.condition || opt.condition(ctx)));

    // Reset value if current selection becomes hidden
    $effect(() => {
        const currentValue = untrack(() => localValue);
        if (processedOptions.length > 0 && currentValue !== undefined && !processedOptions.some(o => o.value === currentValue)) {
            localValue = processedOptions[processedOptions.length - 1].value;
        }
    });
</script>

<span class="text-textcolor {item.classes ?? 'mt-4'}">
    {getLabel(item)}
    {#if item.helpKey}<Help key={item.helpKey as any}/>{/if}
</span>
<SelectInput bind:value={localValue}>
    {#each processedOptions as opt}
        <OptionInput value={opt.value}>
            {opt.labelKey ? (language as any)[opt.labelKey] : opt.label}
        </OptionInput>
    {/each}
</SelectInput>
