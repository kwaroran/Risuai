<script lang="ts">
    import { language } from "src/lang";
    import Accordion from "src/lib/UI/Accordion.svelte";
    import Check from "src/lib/UI/GUI/CheckInput.svelte";
    
    import { DBState } from 'src/ts/stores.svelte';
    import ChatFormatSettings from "./ChatFormatSettings.svelte";
    import OpenrouterProviderList from "src/lib/UI/OpenrouterProviderList.svelte";
    import { PlusIcon, TrashIcon } from "@lucide/svelte";
    import { getOpenRouterProviders } from 'src/ts/model/openrouter'
</script>

<Accordion name={`OpenRouter ${language.settings}`} styled>
    <div class="flex items-center mb-4">
        <Check bind:check={DBState.db.openrouterFallback} name={language.openRouterFallback}/>
    </div>
    <div class="flex items-center mb-4">
        <Check bind:check={DBState.db.openrouterMiddleOut} name={language.openRouterMiddleOut}/>
    </div>
    <div class="flex items-center mb-4">
        <Check bind:check={DBState.db.useInstructPrompt} name={language.useInstructPrompt}/>
    </div>
    {#await getOpenRouterProviders()}
        <Accordion name={language.openRouterProviderOrder} help="openRouterProviderOrder" styled>
            <p>{language.loading}...</p>
        </Accordion>
        <Accordion name={language.openRouterProviderOnly} help="openRouterProviderOnly" styled>
            <p>{language.loading}...</p>
        </Accordion>
        <Accordion name={language.openRouterProviderIgnore} help="openRouterProviderIgnore" styled>
            <p>{language.loading}...</p>
        </Accordion>
    {:then openRouterProviders}
        <Accordion name={language.openRouterProviderOrder} help="openRouterProviderOrder" styled>
            {#each DBState.db.openrouterProvider.order as _, i}
                <span class="text-textcolor mt-4">
                    {language.provider} {i + 1}
                </span>
                <OpenrouterProviderList bind:value={DBState.db.openrouterProvider.order[i]} options={openRouterProviders} />
            {/each}
            <div class="flex gap-2">
                <button class="bg-selected text-white p-2 rounded-md" onclick={() => {
                    let value = DBState.db.openrouterProvider.order ?? []
                    value.push('')
                    DBState.db.openrouterProvider.order = value
            }}><PlusIcon /></button>
                <button class="bg-red-500 text-white p-2 rounded-md" onclick={() => {
                    let value = DBState.db.openrouterProvider.order ?? []
                    value.pop()
                    DBState.db.openrouterProvider.order = value
            }}><TrashIcon /></button>
            </div>
        </Accordion>

        <Accordion name={language.openRouterProviderOnly} help="openRouterProviderOnly" styled>
            {#each DBState.db.openrouterProvider.only as model, i}
                <span class="text-textcolor mt-4">
                    {language.provider} {i + 1}
                </span>
                <OpenrouterProviderList bind:value={DBState.db.openrouterProvider.only[i]} options={openRouterProviders} />
            {/each}
            <div class="flex gap-2">
                <button class="bg-selected text-white p-2 rounded-md" onclick={() => {
                    let value = DBState.db.openrouterProvider.only ?? []
                    value.push('')
                    DBState.db.openrouterProvider.only = value
            }}><PlusIcon /></button>
                <button class="bg-red-500 text-white p-2 rounded-md" onclick={() => {
                    let value = DBState.db.openrouterProvider.only ?? []
                    value.pop()
                    DBState.db.openrouterProvider.only = value
            }}><TrashIcon /></button>
            </div>
        </Accordion>

        <Accordion name={language.openRouterProviderIgnore} help="openRouterProviderIgnore" styled>
            {#each DBState.db.openrouterProvider.ignore as model, i}
                <span class="text-textcolor mt-4">
                    {language.provider} {i + 1}
                </span>
                <OpenrouterProviderList bind:value={DBState.db.openrouterProvider.ignore[i]} options={openRouterProviders} />
            {/each}
            <div class="flex gap-2">
                <button class="bg-selected text-white p-2 rounded-md" onclick={() => {
                    let value = DBState.db.openrouterProvider.ignore ?? []
                    value.push('')
                    DBState.db.openrouterProvider.ignore = value
            }}><PlusIcon /></button>
                <button class="bg-red-500 text-white p-2 rounded-md" onclick={() => {
                    let value = DBState.db.openrouterProvider.ignore ?? []
                    value.pop()
                    DBState.db.openrouterProvider.ignore = value
            }}><TrashIcon /></button>
            </div>
        </Accordion>
    {/await}

    {#if DBState.db.useInstructPrompt}
        <ChatFormatSettings />
    {/if}
</Accordion>
