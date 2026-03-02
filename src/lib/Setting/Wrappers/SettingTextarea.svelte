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

    let valueProxy = {
        get value() {
            return getSettingValue(item, ctx);
        },
        set value(v) {
            setSettingValue(item, v, ctx);
        }
    };

    

    
</script>

<span class="text-textcolor {item.classes ?? ''}">
    {getLabel(item)}
    {#if item.helpKey}<Help key={item.helpKey as any}/>{/if}
</span>
<TextAreaInput
    bind:value={valueProxy.value}
    placeholder={item.options?.placeholder}
    
/>
