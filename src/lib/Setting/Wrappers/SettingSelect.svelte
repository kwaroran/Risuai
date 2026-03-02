<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';
    import Help from 'src/lib/Others/Help.svelte';
    import { language } from 'src/lang';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item, ctx }: Props = $props();

    let valueProxy = {
        get value() {
            return getSettingValue(item, ctx);
        },
        set value(v) {
            setSettingValue(item, v, ctx);
        }
    };

    

    

    // Process options to support labelKey translation and conditional rendering
    let processedOptions = $derived((item.options?.selectOptions ?? []).filter(opt => !opt.condition || opt.condition(ctx)));

    // Reset value if current selection becomes hidden
    $effect(() => {
        const currentValue = valueProxy.value;
        if (processedOptions.length > 0 && currentValue !== undefined && !processedOptions.some(o => o.value === currentValue)) {
            valueProxy.value = processedOptions[processedOptions.length - 1].value;
        }
    });
</script>

<span class="text-textcolor {item.classes ?? 'mt-4'}">
    {getLabel(item)}
    {#if item.helpKey}<Help key={item.helpKey as any}/>{/if}
</span>
<SelectInput bind:value={valueProxy.value} >
    {#each processedOptions as opt}
        <OptionInput value={opt.value}>
            {('labelKey' in opt && opt.labelKey) ? (language as any)[opt.labelKey] : opt.label}
        </OptionInput>
    {/each}
</SelectInput>
