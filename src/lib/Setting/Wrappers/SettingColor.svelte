<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import { untrack } from 'svelte';
    import ColorInput from 'src/lib/UI/GUI/ColorInput.svelte';

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
    <ColorInput bind:value={localValue} />
    <span class="ml-2">{getLabel(item)}</span>
</div>
