<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { UNINITIALIZED, getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import { untrack } from 'svelte';
    import Help from 'src/lib/Others/Help.svelte';
    import SwitchInput from 'src/lib/UI/GUI/SwitchInput.svelte';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item, ctx }: Props = $props();
    // Help icons are buttons, so without an explicit `for` the label would bind to them instead of the switch.
    const inputId = $props.id();

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
</script>

<!-- w-fit keeps the click target to the switch and its label instead of the whole row width. -->
<label for={inputId} class="rs-setting-check flex w-fit max-w-full items-center gap-3 py-1 cursor-pointer select-none text-textcolor {item.classes ?? 'mt-2'}">
    <SwitchInput id={inputId} bind:check={localValue} />
    <span class="min-w-0">
        {getLabel(item)}
        {#if item.showExperimental}<Help key="experimental"/>{/if}
        {#if item.helpKey}<Help key={item.helpKey as any} unrecommended={item.helpUnrecommended ?? false}/>{/if}
    </span>
</label>
