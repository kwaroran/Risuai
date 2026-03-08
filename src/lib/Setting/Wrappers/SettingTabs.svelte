<script lang="ts">
    import type { SettingItem, SettingContext } from 'src/ts/setting/types';
    import { getLabel } from 'src/ts/setting/utils';
    import SettingRenderer from '../SettingRenderer.svelte';
    import { language } from 'src/lang';

    interface Props {
        item: SettingItem;
        ctx: SettingContext;
    }

    let { item, ctx }: Props = $props();

    let activeTab = $state(0);

    let tabs = $derived(item.options?.tabs ?? []);

    function getTabLabel(tab: typeof tabs[number]): string {
        if (tab.labelKey && (language as any)[tab.labelKey]) {
            return (language as any)[tab.labelKey];
        }
        return tab.label ?? '';
    }
</script>

{#if tabs.length > 0}
    <div class="flex w-full rounded-md border border-darkborderc mb-4 overflow-x-auto h-16 min-h-16 overflow-y-clip">
        {#each tabs as tab, i}
            <button
                onclick={() => { activeTab = i }}
                class="p-2 flex-1 border-r border-darkborderc last:border-r-0"
                class:bg-darkbutton={activeTab === i}
            >
                <span>{getTabLabel(tab)}</span>
            </button>
        {/each}
    </div>

    {#if tabs[activeTab]?.children}
        <SettingRenderer items={tabs[activeTab].children} modelInfo={ctx.modelInfo} subModelInfo={ctx.subModelInfo} />
    {/if}
{/if}
