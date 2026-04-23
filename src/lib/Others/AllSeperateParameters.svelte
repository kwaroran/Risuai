<script lang="ts">
    import { DBState } from "src/ts/stores.svelte";
    import Help from "./Help.svelte";
    import { language } from "src/lang";
    import SliderInput from "../UI/GUI/SliderInput.svelte";
    import ClaudeThinkingSeparateParams from "../Setting/Pages/ClaudeThinkingSeparateParams.svelte";
    import type { SeparateParameters } from "src/ts/storage/database.svelte";
    import { downloadFile } from "src/ts/globalApi.svelte";
    import { FileDownIcon, FileUpIcon, ImportIcon } from "@lucide/svelte";
    import { selectSingleFile } from "src/ts/util";


    let {
        value = $bindable(),
        withImportExport = false
    }:{
        value: SeparateParameters
        withImportExport?: boolean
    } = $props()
</script>

<span class="text-textcolor">{language.temperature} <Help key="tempature"/></span>
<SliderInput min={0} max={200} marginBottom bind:value={value.temperature} multiple={0.01} fixed={2} disableable/>
<span class="text-textcolor">Top K</span>
<SliderInput min={0} max={100} marginBottom step={1} bind:value={value.top_k} disableable/>
<span class="text-textcolor">{'Repetition Penalty'}</span>
<SliderInput min={0} max={2} marginBottom step={0.01} fixed={2} bind:value={value.repetition_penalty} disableable/>
<span class="text-textcolor">Min P</span>
<SliderInput min={0} max={1} marginBottom step={0.01} fixed={2} bind:value={value.min_p} disableable/>
<span class="text-textcolor">Top A</span>
<SliderInput min={0} max={1} marginBottom step={0.01} fixed={2} bind:value={value.top_a} disableable/>
<span class="text-textcolor">Top P</span>
<SliderInput min={0} max={1} marginBottom step={0.01} fixed={2} bind:value={value.top_p} disableable/>
<span class="text-textcolor">{language.frequencyPenalty}</span>
<SliderInput min={0} max={200} marginBottom step={0.01} fixed={2} bind:value={value.frequency_penalty} disableable/>
<span class="text-textcolor">{language.presensePenalty}</span>
<SliderInput min={0} max={200} marginBottom step={0.01} fixed={2} bind:value={value.presence_penalty} disableable/>
<ClaudeThinkingSeparateParams bind:value={value} />
<span class="text-textcolor">{'Verbosity'}</span>
<SliderInput min={0} max={2} marginBottom step={1} fixed={0} bind:value={value.verbosity} disableable/>

{#if withImportExport}
    <div class="flex">
        <button class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded" onclick={() => {
            const json = JSON.stringify(value, null, 2)
            downloadFile(`parameters-${Date.now()}.json`, json)
        }}>
            <FileDownIcon />
        </button>
        <button class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded ml-2" onclick={async () => {
            const file = await selectSingleFile(['json'])
            const fileText = await (new TextDecoder()).decode(file.data)
            try {
                const json = JSON.parse(fileText)

                value = json
            } catch (e) {
                alert(language.noData)
            }
        }}>
            <FileUpIcon />
        </button>
    </div>
{/if}