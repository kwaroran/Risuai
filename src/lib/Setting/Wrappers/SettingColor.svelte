<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel, getSettingValue, setSettingValue } from 'src/ts/setting/utils';
    import ColorInput from 'src/lib/UI/GUI/ColorInput.svelte';

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

<div class="flex items-center {item.classes ?? 'mt-2'}">
    <ColorInput bind:value={valueProxy.value}  />
    <span class="ml-2">{getLabel(item)}</span>
</div>
