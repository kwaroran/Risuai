<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import SegmentedControl from 'src/lib/UI/GUI/SegmentedControl.svelte';
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

    

    

    // Transform options for translation
    let processedOptions = $derived((item.options?.segmentOptions ?? [])
        .filter(opt => !opt.condition || opt.condition(ctx))
        .map(opt => ({
            ...opt,
            label: ('labelKey' in opt && opt.labelKey) ? (language as any)[opt.labelKey] : opt.label
        })));

    // Reset value if current selection becomes hidden
    $effect(() => {
        const currentValue = valueProxy.value;
        if (processedOptions.length > 0 && currentValue !== undefined && !processedOptions.some(o => o.value === currentValue)) {
            valueProxy.value = processedOptions[processedOptions.length - 1].value;
        }
    });
</script>

<span class="text-textcolor {item.classes ?? ''}">
    {getLabel(item)}
    {#if item.helpKey}<Help key={item.helpKey as any}/>{/if}
</span>
<SegmentedControl
    bind:value={valueProxy.value}
    options={processedOptions}
    
/>
