<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel } from 'src/ts/setting/utils';
    import Button from 'src/lib/UI/GUI/Button.svelte';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item }: Props = $props();
</script>

<Button 
    className={item.classes ?? 'mt-4'}
    onclick={item.options?.onClick}
>
    {getLabel(item)}
</Button>
