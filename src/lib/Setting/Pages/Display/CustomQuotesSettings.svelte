<script lang="ts">
    import { language } from "src/lang";
    import { DBState } from "src/ts/stores.svelte";
    import TextInput from "src/lib/UI/GUI/TextInput.svelte";
</script>

<span class="text-textcolor mt-4">{language.leadingDoubleQuote}</span>
<TextInput bind:value={DBState.db.customQuotesData[0]} />

<span class="text-textcolor mt-4">{language.trailingDoubleQuote}</span>
<TextInput bind:value={DBState.db.customQuotesData[1]} />

<span class="text-textcolor mt-4">{language.leadingSingleQuote}</span>
<TextInput bind:value={DBState.db.customQuotesData[2]} />

<span class="text-textcolor mt-4">{language.trailingSingleQuote}</span>
<TextInput bind:value={DBState.db.customQuotesData[3]} />
