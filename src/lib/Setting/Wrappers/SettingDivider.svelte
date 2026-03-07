<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel } from 'src/ts/setting/utils';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item }: Props = $props();
</script>

{#if getLabel(item)}
    <div class="flex items-center mt-4 mb-0 {item.classes ?? ''}">
        {#if item.options?.alignment !== 'left'}
            <hr class="border-darkborderc grow" />
        {:else}
            <hr class="border-darkborderc w-8" />
        {/if}
        
        <span class="text-textcolor mx-4 text-sm whitespace-nowrap">{getLabel(item)}</span>
        
        {#if item.options?.alignment !== 'right'}
            <hr class="border-darkborderc grow" />
        {:else}
            <hr class="border-darkborderc w-8" />
        {/if}
    </div>
{:else}
    <hr class="border-darkborderc mt-4 mb-0 {item.classes ?? ''}" />
{/if}
