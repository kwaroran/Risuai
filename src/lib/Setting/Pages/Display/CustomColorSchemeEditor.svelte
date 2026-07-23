<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import {
        changeColorSchemeType,
        exportColorScheme,
        importColorScheme,
        updateColorScheme,
    } from 'src/ts/gui/colorscheme';
    import SelectInput from 'src/lib/UI/GUI/SelectInput.svelte';
    import OptionInput from 'src/lib/UI/GUI/OptionInput.svelte';
    import ColorInput from 'src/lib/UI/GUI/ColorInput.svelte';
    import { DownloadIcon, HardDriveUploadIcon } from '@lucide/svelte';

    const colors = [
        ['bgcolor', 'Background'],
        ['darkbg', 'Dark Background'],
        ['borderc', 'Color 1'],
        ['selected', 'Color 2'],
        ['draculared', 'Color 3'],
        ['darkBorderc', 'Color 4'],
        ['darkbutton', 'Color 5'],
        ['textcolor', 'Text Color'],
        ['textcolor2', 'Text Color 2'],
    ] as const;
</script>

{#if DBState.db.colorSchemeName === 'custom'}
    <div class="border border-darkborderc p-2 m-2 rounded-md">
        <SelectInput
            className="mt-2"
            value={DBState.db.colorScheme.type}
            onchange={(e) => {
                changeColorSchemeType((e.target as HTMLInputElement).value as 'light' | 'dark');
            }}
        >
            <OptionInput value="light">Light</OptionInput>
            <OptionInput value="dark">Dark</OptionInput>
        </SelectInput>

        {#each colors as color}
            <div class="flex items-center mt-2">
                <ColorInput bind:value={DBState.db.colorScheme[color[0]]} oninput={updateColorScheme} />
                <span class="ml-2">{color[1]}</span>
            </div>
        {/each}

        <div class="grow flex justify-end">
            <button
                class="text-textcolor2 hover:text-green-500 mr-2 cursor-pointer"
                onclick={() => exportColorScheme()}
            >
                <DownloadIcon size={18} />
            </button>
            <button
                class="text-textcolor2 hover:text-green-500 cursor-pointer"
                onclick={() => importColorScheme()}
            >
                <HardDriveUploadIcon size={18} />
            </button>
        </div>
    </div>
{/if}
