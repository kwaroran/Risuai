<script lang="ts">
    import type { triggerscript } from "src/ts/storage/database.svelte";
    import { language } from "src/lang";
    import { alertConfirm } from "src/ts/alert";
    import TextAreaInput from "src/lib/UI/GUI/TextAreaInput.svelte";
    import Button from "src/lib/UI/GUI/Button.svelte";
    import { openURL } from "src/ts/globalApi.svelte";
    import { hubURL } from "src/ts/characterCards";
    import TriggerV2List from "./TriggerV2List.svelte";
    import { DBState } from "src/ts/stores.svelte";

    interface Props {
        value?: triggerscript[];
        lowLevelAble?: boolean;
    }

    let { value = $bindable([]), lowLevelAble = false }: Props = $props();
    let v1Enabled = $derived(value?.[0]?.effect?.[0]?.type !== 'triggercode' && value?.[0]?.effect?.[0]?.type !== 'triggerlua' && value?.[0]?.effect?.[0]?.type !== 'v2Header')

    const loadTriggerV1List = () => import("./TriggerV1List.svelte").then(m => m.default)
</script>

<div class="flex items-start mt-2 gap-2">
    {#if v1Enabled || DBState.db.showDeprecatedTriggerV1 }
        <button class="bg-bgcolor py-1 rounded-md text-sm px-2" class:ring-1={v1Enabled} onclick={(async (e) => {
            e.stopPropagation()
            const codeType = value?.[0]?.effect?.[0]?.type
            if(codeType === 'triggercode' || codeType === 'triggerlua' || codeType === 'v2Header'){
                const t = await alertConfirm(language.triggerSwitchWarn)
                if(!t){
                    return
                }
                value = []
            }
        })}>V1</button>
    {/if}
    <button class="bg-bgcolor py-1 rounded-md text-sm px-2" class:ring-1={
        value?.[0]?.effect?.[0]?.type === 'v2Header'
    } onclick={(async (e) => {
        e.stopPropagation()
        const codeType = value?.[0]?.effect?.[0]?.type
        if(codeType !== 'v2Header'){
            const t = await alertConfirm(language.triggerSwitchWarn)
            if(!t){
                return
            }
            value = [{
                comment: "",
                type: "manual",
                conditions: [],
                effect: [{
                    type: "v2Header",
                    code: "",
                    indent: 0
                }]
            }, {
                comment: "New Event",
                type: 'manual',
                conditions: [],
                effect: []
            }]
        }
    })}>V2</button>
    <button class="bg-bgcolor py-1 rounded-md text-sm px-2" class:ring-1={value?.[0]?.effect?.[0]?.type === 'triggerlua'} onclick={(async (e) => {
        e.stopPropagation()
        if(value?.[0]?.effect?.[0]?.type !== 'triggerlua'){
            if(value && value.length > 0){
                const t = await alertConfirm(language.triggerSwitchWarn)
                if(!t){
                    return
                }
            }
            value = [{
                comment: "",
                type: "start",
                conditions: [],
                effect: [{
                    type: "triggerlua",
                    code: ""
                }]
            }]
        }
    })}>Lua</button>
</div>
{#if v1Enabled}
    <span class="text-draculared">{language.triggerV1Warning}</span>
{/if}
{#if value?.[0]?.effect?.[0]?.type === 'triggerlua'}
    <TextAreaInput margin="both" autocomplete="off" bind:value={value[0].effect[0].code}></TextAreaInput>
    <Button onclick={() => {
        openURL(hubURL + '/redirect/docs/lua')
    }}>{language.helpBlock}</Button>
{:else if value?.[0]?.effect?.[0]?.type === 'v2Header'}
    <TriggerV2List bind:value={value} lowLevelAble={lowLevelAble}/>
{:else}
    {#await loadTriggerV1List() then TriggerV1List}
        <TriggerV1List bind:value={value} lowLevelAble={lowLevelAble}/>
    {/await}
{/if}
