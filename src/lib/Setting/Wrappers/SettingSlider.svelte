<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import SliderInput from 'src/lib/UI/GUI/SliderInput.svelte';
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
<SliderInput 
    marginBottom={true}
    min={item.options?.min} 
    max={item.options?.max}
    step={item.options?.step}
    fixed={item.options?.fixed}
    multiple={item.options?.multiple}
    disableable={item.options?.disableable}
    customText={item.options?.customText}
    bind:value={valueProxy.value}
    
/>
