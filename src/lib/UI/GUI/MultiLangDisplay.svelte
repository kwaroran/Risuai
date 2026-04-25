<script lang="ts">
    import { ColorSchemeTypeStore } from "src/ts/gui/colorscheme";
    import { ParseMarkdown } from "src/ts/parser/parser.svelte";
    import { parseMultilangString, toLangName } from "src/ts/util";
    import { DBState } from "src/ts/stores.svelte";

    interface Props {
        value: string;
        markdown?: boolean;
    }

    let { value, markdown = false }: Props = $props();
    let valueObject: {[code:string]:string} = $derived(parseMultilangString(value))

    let userLang = $derived(DBState.db.language)

    let defaultLang = $derived.by(() => {
        if(valueObject[userLang] !== undefined) return userLang
        if(valueObject["en"] !== undefined) return "en"
        return "xx"
    })

    let selectedLang = $state("")
    $effect.pre(() => {
        selectedLang = defaultLang
    });

    let sortedLangs = $derived.by(() => {
        const keys = Object.keys(valueObject)
        const prioritized = keys.find(k => k === userLang)
        if(!prioritized) return { priority: null, rest: keys }
        return {
            priority: prioritized,
            rest: keys.filter(k => k !== prioritized)
        }
    })
</script>

<div class="flex flex-col">
    <div class="flex flex-wrap max-w-fit p-1 gap-2 items-center">
        {#if sortedLangs.priority}
            {#if sortedLangs.priority !== 'xx' || Object.keys(valueObject).length === 1}
                <button class="bg-bgcolor py-2 rounded-lg px-4" class:ring-1={selectedLang === sortedLangs.priority} onclick={((e) => {
                    e.stopPropagation()
                    selectedLang = sortedLangs.priority
                })}>{toLangName(sortedLangs.priority)}</button>
            {/if}
            {#if sortedLangs.rest.length > 0}
                <div class="border-l border-l-selected h-6"></div>
            {/if}
        {/if}
        {#each sortedLangs.rest as lang}
            {#if lang !== 'xx' || Object.keys(valueObject).length === 1}
                <button class="bg-bgcolor py-2 rounded-lg px-4" class:ring-1={selectedLang === lang} onclick={((e) => {
                    e.stopPropagation()
                    selectedLang = lang
                })}>{toLangName(lang)}</button>
            {/if}
        {/each}
    </div>
    {#if markdown}
        <div class="ml-2 max-w-full wrap-break-word text chat chattext prose" class:prose-invert={$ColorSchemeTypeStore}>
            {#await ParseMarkdown(valueObject[selectedLang]) then md} 
                {@html md}
            {/await}
        </div>
    {:else}
        <div class="ml-2 max-w-full wrap-break-word text chat chattext prose" class:prose-invert={$ColorSchemeTypeStore}>
            {valueObject[selectedLang]}
        </div>
    {/if}
</div>