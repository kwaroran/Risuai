<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import { updateTextThemeAndCSS } from "src/ts/gui/colorscheme";
    import ColorInput from "src/lib/UI/GUI/ColorInput.svelte";
</script>

<div class="flex items-center mt-2">
    <ColorInput bind:value={DBState.db.customTextTheme.FontColorStandard} oninput={updateTextThemeAndCSS} />
    <span class="ml-2">Normal Text</span>
</div>
<div class="flex items-center mt-2">
    <ColorInput bind:value={DBState.db.customTextTheme.FontColorItalic} oninput={updateTextThemeAndCSS} />
    <span class="ml-2">Italic Text</span>
</div>
<div class="flex items-center mt-2">
    <ColorInput bind:value={DBState.db.customTextTheme.FontColorBold} oninput={updateTextThemeAndCSS} />
    <span class="ml-2">Bold Text</span>
</div>
<div class="flex items-center mt-2">
    <ColorInput bind:value={DBState.db.customTextTheme.FontColorItalicBold} oninput={updateTextThemeAndCSS} />
    <span class="ml-2">Italic Bold Text</span>
</div>
<div class="flex items-center mt-2">
    <ColorInput nullable bind:value={DBState.db.customTextTheme.FontColorQuote1} oninput={updateTextThemeAndCSS} />
    <span class="ml-2">Single Quote Text</span>
</div>
<div class="flex items-center mt-2">
    <ColorInput nullable bind:value={DBState.db.customTextTheme.FontColorQuote2} oninput={updateTextThemeAndCSS} />
    <span class="ml-2">Double Quote Text</span>
</div>
