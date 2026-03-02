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

    let value = $state(getSettingValue(item, ctx));

    $effect(() => {
        value = getSettingValue(item, ctx);
    });

    function handleChange() {
        setSettingValue(item, value, ctx);
    }

    // Transform options for translation
    let processedOptions = $derived((item.options?.segmentOptions ?? [])
        .filter(opt => !opt.condition || opt.condition(ctx))
        .map(opt => ({
            ...opt,
            label: ('labelKey' in opt && opt.labelKey) ? (language as any)[opt.labelKey] : opt.label
        })));

    // Reset value if current selection becomes hidden
    $effect(() => {
        if (processedOptions.length > 0 && value !== undefined && !processedOptions.some(o => o.value === value)) {
            value = processedOptions[processedOptions.length - 1].value;
            handleChange();
        }
    });
</script>

<span class="text-textcolor {item.classes ?? ''}">
    {getLabel(item)}
    {#if item.helpKey}<Help key={item.helpKey as any}/>{/if}
</span>
<SegmentedControl
    bind:value={value}
    options={processedOptions}
    onchange={handleChange}
/>
