<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel } from 'src/ts/setting/utils';
    import Accordion from 'src/lib/UI/Accordion.svelte';
    import SettingRenderer from '../SettingRenderer.svelte'; // Recursive import

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item, ctx }: Props = $props();
</script>

<Accordion name={getLabel(item)} styled={item.options?.styled ?? false}>
    {#if item.options?.children}
        <SettingRenderer items={item.options.children} modelInfo={ctx.modelInfo} subModelInfo={ctx.subModelInfo} />
    {/if}
</Accordion>
