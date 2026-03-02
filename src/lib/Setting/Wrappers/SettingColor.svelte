<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import ColorInput from 'src/lib/UI/GUI/ColorInput.svelte';

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

<div class="flex items-center {item.classes ?? 'mt-2'}">
    <ColorInput bind:value={value} oninput={handleChange} />
    <span class="ml-2">{getLabel(item)}</span>
</div>
