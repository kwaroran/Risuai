<script lang="ts">
    import { Cog, PinIcon } from '@lucide/svelte'
    import { DBState, loadoutModalStore, openPersonaList, openPresetList, selectedCharID } from 'src/ts/stores.svelte';
    import Button from '../UI/GUI/Button.svelte';
    import type { CustomSideBarItem } from 'src/ts/storage/database.svelte';
    import { language } from 'src/lang';
    import TextInput from '../UI/GUI/TextInput.svelte';
    import { getFullSettingsData } from 'src/ts/setting/utils';
    import ModelList from '../UI/ModelList.svelte';
    import { get } from 'svelte/store';
    import SettingRenderer from '../Setting/SettingRenderer.svelte';
    import { checkPersonaBinded, getUserName } from 'src/ts/util';
    import { v4 } from 'uuid';
    let configPage:'list'|'add'|'addSettingsSubmenu' = $state('list')
    let search = $state('')

    let bindedPersona = $derived.by(() => {

        DBState.db.characters[$selectedCharID].chatPage
        return checkPersonaBinded()
    })

    let personaName = $derived.by(() => {
        if(bindedPersona){
            return bindedPersona?.name
        }
        return DBState.db.username
    })
</script>


<div class="rounded-sm flex flex-col w-full gap-2">

    {#each DBState.db.customSidebarItems as item}
        {#if item.type === 'model'}
            <ModelList bind:value={DBState.db.aiModel} noMargin />
        {:else if item.type === 'preset'}
            <Button onclick={() => {
                openPresetList.set(!get(openPresetList))
            }}>{
                DBState.db.botPresets?.[DBState.db.botPresetsId]?.name
                ||
                language.presets
            }</Button>
        {:else if item.type === 'loadout'}
            <Button onclick={() => {
                loadoutModalStore.open = !loadoutModalStore.open
            }}>{DBState.db.lastLoadedLoadoutName || language.loadouts}</Button>
        {:else if item.type === 'persona'}
            <Button className="flex" onclick={() => {
                if(bindedPersona){
                    return
                }
                openPersonaList.set(!get(openPersonaList))
            }}>
                <div class="flex-1 flex-col flex text-left">
                    <span>{personaName}</span>
                    {#if bindedPersona?.note}
                        <span class="text-xs text-textcolor2">{bindedPersona?.note}</span>
                    {/if}
                </div>

                <button class={{
                    "ml-2": true,
                    "text-textcolor2": !bindedPersona,
                    "text-textcolor": bindedPersona
                }} onclick={(e) => {
                    e.stopPropagation()
                    const chatIndex =DBState.db.characters[$selectedCharID].chatPage
                    if(!DBState.db.personas[DBState.db.selectedPersona].id){
                        DBState.db.personas[DBState.db.selectedPersona].id = v4()
                    }
                    if(checkPersonaBinded()) {
                        DBState.db.characters[$selectedCharID].chats[chatIndex].bindedPersona = ''
                    }
                    else{
                        DBState.db.characters[$selectedCharID].chats[chatIndex].bindedPersona = DBState.db.personas[DBState.db.selectedPersona].id
                    }
                }}>
                    <PinIcon size={20} />
                </button>
            </Button>
        {:else if item.type === 'setting'}
            <SettingRenderer items={
                [getFullSettingsData().find(s => s.id === item.subType)]
            } />
        {/if}
    {/each}
</div>