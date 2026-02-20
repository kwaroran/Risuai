<script lang="ts">
    import { language } from 'src/lang';
    import { DBState } from 'src/ts/stores.svelte';
    import SliderInput from 'src/lib/UI/GUI/SliderInput.svelte';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';

    interface Props {
        param: string;
    }

    let { param }: Props = $props();
</script>

<span class="text-textcolor">{language.thinkingType ?? 'Thinking Mode'}</span>
<SelectInput bind:value={DBState.db.seperateParameters[param].thinking_type}>
    <OptionInput value="off">Off</OptionInput>
    <OptionInput value="budget">Budget (Manual Tokens)</OptionInput>
    <OptionInput value="adaptive">Adaptive</OptionInput>
</SelectInput>
{#if DBState.db.seperateParameters[param].thinking_type === 'budget'}
    <span class="text-textcolor">{language.thinkingTokens}</span>
    <SliderInput min={0} max={64000} marginBottom step={200} fixed={0} bind:value={DBState.db.seperateParameters[param].thinking_tokens} disableable/>
{/if}
{#if DBState.db.seperateParameters[param].thinking_type === 'adaptive'}
    <span class="text-textcolor">{language.adaptiveThinkingEffort ?? 'Adaptive Thinking Effort'}</span>
    <SelectInput bind:value={DBState.db.seperateParameters[param].adaptive_thinking_effort}>
        <OptionInput value="low">Low</OptionInput>
        <OptionInput value="medium">Medium</OptionInput>
        <OptionInput value="high">High</OptionInput>
        <OptionInput value="max">Max</OptionInput>
    </SelectInput>
{/if}
