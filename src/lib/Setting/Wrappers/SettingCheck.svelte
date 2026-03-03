<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import { untrack } from 'svelte';
    import Check from 'src/lib/UI/GUI/CheckInput.svelte';
    import Help from 'src/lib/Others/Help.svelte';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item, ctx }: Props = $props();

    let localValue: any = $state(undefined);

    // Sync: DB → local
    $effect(() => {
        localValue = getSettingValue(item, ctx);
    });

    // Sync: local → DB
    $effect(() => {
        const val = localValue;
        untrack(() => setSettingValue(item, val, ctx));
    });
</script>

<div class="flex items-center {item.classes ?? 'mt-2'}">
    <Check bind:check={localValue} name={getLabel(item)} >
        {#if item.showExperimental}<Help key="experimental"/>{/if}
        {#if item.helpKey}<Help key={item.helpKey as any} unrecommended={item.helpUnrecommended ?? false}/>{/if}
    </Check>
</div>
