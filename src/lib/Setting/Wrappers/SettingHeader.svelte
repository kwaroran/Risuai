<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel } from 'src/ts/setting/utils';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item }: Props = $props();
</script>

{#if item.options?.level === 'h2'}
    <h2 class="mb-2 text-2xl font-bold mt-2 {item.classes ?? ''}">{getLabel(item)}</h2>
{:else if item.options?.level === 'warning'}
    <span class="text-draculared text-xs mb-2 {item.classes ?? ''}">{getLabel(item)}</span>
{:else}
    <span class="text-textcolor mt-4 mb-2 {item.classes ?? ''}">{getLabel(item)}</span>
{/if}
