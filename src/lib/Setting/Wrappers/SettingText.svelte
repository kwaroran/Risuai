<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import { untrack } from 'svelte';
    import TextInput from 'src/lib/UI/GUI/TextInput.svelte';
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

<span class="text-textcolor {item.classes ?? ''}">
    {getLabel(item)}
    {#if item.helpKey}<Help key={item.helpKey as any}/>{/if}
</span>
<TextInput
    marginBottom={true}
    size="sm"
    bind:value={localValue}
    placeholder={item.options?.placeholder}
    hideText={item.options?.hideText}
/>
