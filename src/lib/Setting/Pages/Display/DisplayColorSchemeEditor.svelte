<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import { language } from 'src/lang';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';
    import ColorInput from 'src/lib/UI/GUI/ColorInput.svelte';
    import { DownloadIcon, HardDriveUploadIcon } from '@lucide/svelte';
    import { changeColorScheme, changeColorSchemeType, colorSchemeList, exportColorScheme, importColorScheme, updateColorScheme } from 'src/ts/gui/colorscheme';
</script>

<span class="text-textcolor mt-4">{language.colorScheme}</span>
<SelectInput className="mt-2" value={DBState.db.colorSchemeName} onchange={(e) => {
    changeColorScheme((e.target as HTMLInputElement).value)
}}>
    {#each colorSchemeList as scheme}
        <OptionInput value={scheme}>{scheme}</OptionInput>
    {/each}
    <OptionInput value="custom">Custom</OptionInput>
</SelectInput>

{#if DBState.db.colorSchemeName === "custom"}
<div class="border border-darkborderc p-2 m-2 rounded-md">
    <SelectInput className="mt-2" value={DBState.db.colorScheme.type} onchange={(e) => {
        changeColorSchemeType((e.target as HTMLInputElement).value as 'light'|'dark')
    }}>
        <OptionInput value="light">Light</OptionInput>
        <OptionInput value="dark">Dark</OptionInput>
    </SelectInput>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.bgcolor} oninput={updateColorScheme} />
        <span class="ml-2">Background</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.darkbg} oninput={updateColorScheme} />
        <span class="ml-2">Dark Background</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.borderc} oninput={updateColorScheme} />
        <span class="ml-2">Color 1</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.selected} oninput={updateColorScheme} />
        <span class="ml-2">Color 2</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.draculared} oninput={updateColorScheme} />
        <span class="ml-2">Color 3</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.darkBorderc} oninput={updateColorScheme} />
        <span class="ml-2">Color 4</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.darkbutton} oninput={updateColorScheme} />
        <span class="ml-2">Color 5</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.textcolor} oninput={updateColorScheme} />
        <span class="ml-2">Text Color</span>
    </div>
    <div class="flex items-center mt-2">
        <ColorInput bind:value={DBState.db.colorScheme.textcolor2} oninput={updateColorScheme} />
        <span class="ml-2">Text Color 2</span>
    </div>
    <div class="grow flex justify-end">
        <button class="text-textcolor2 hover:text-green-500 mr-2 cursor-pointer" onclick={async () => {
            exportColorScheme()
        }}>
            <DownloadIcon size={18}/>
        </button>
        <button class="text-textcolor2 hover:text-green-500 cursor-pointer" onclick={async () => {
            importColorScheme()
        }}>
            <HardDriveUploadIcon size={18}/>
        </button>
    </div>
</div>
{/if}
