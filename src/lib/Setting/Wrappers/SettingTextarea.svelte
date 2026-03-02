<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import TextAreaInput from 'src/lib/UI/GUI/TextAreaInput.svelte';
    import Help from 'src/lib/Others/Help.svelte';

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
</script>

<span class="text-textcolor {item.classes ?? ''}">
    {getLabel(item)}
    {#if item.helpKey}<Help key={item.helpKey as any}/>{/if}
</span>
<TextAreaInput
    bind:value={value}
    placeholder={item.options?.placeholder}
    onInput={handleChange}
/>
