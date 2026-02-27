<script lang="ts">
    import { DBState } from "src/ts/stores.svelte";
    import Help from "./Help.svelte";
    import { language } from "src/lang";
    import SliderInput from "../UI/GUI/SliderInput.svelte";
    import ClaudeThinkingSeparateParams from "../Setting/Pages/ClaudeThinkingSeparateParams.svelte";
    import type { SeparateParameters } from "src/ts/storage/database.svelte";


    let {
        value = $bindable()
    }:{
        value: SeparateParameters
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