<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import Check from 'src/lib/UI/GUI/CheckInput.svelte';
    import Help from 'src/lib/Others/Help.svelte';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item, ctx }: Props = $props();

    // Proxy object for two-way binding
    let value = $state(getSettingValue(item, ctx));

    // Synchronize internal state when external changes occur
    $effect(() => {
        value = getSettingValue(item, ctx);
    });

    function handleChange(e?: any) {
        // Reflect to DB when component internal state changes
        setSettingValue(item, value, ctx);
    }
</script>

<div class="flex items-center {item.classes ?? 'mt-2'}">
    <Check bind:check={value} name={getLabel(item)} onChange={handleChange}>
        {#if item.showExperimental}<Help key="experimental"/>{/if}
        {#if item.helpKey}<Help key={item.helpKey as any} unrecommended={item.helpUnrecommended ?? false}/>{/if}
    </Check>
</div>
