<script lang="ts">
    import { language } from "src/lang";
    import { DBState } from "src/ts/stores.svelte";
    import SettingRenderer from "../SettingRenderer.svelte";
    import {
        displayOtherSettingsItems,
        displaySizeSettingsItems,
        displayThemeSettingsItems,
    } from "src/ts/setting/displaySettingsData.svelte";

    let submenu = $state(DBState.db.useLegacyGUI ? -1 : 0);
</script>

<h2 class="mb-2 text-2xl font-bold mt-2">{language.display}</h2>

{#if submenu !== -1}
    <div class="flex w-full rounded-md border border-darkborderc mb-4 overflow-x-auto h-16 min-h-16 overflow-y-clip">
        <button
            onclick={() => {
                submenu = 0;
            }}
            class="p-2 flex-1 border-r border-darkborderc"
            class:bg-darkbutton={submenu === 0}
        >
            <span>{language.theme}</span>
        </button>
        <button
            onclick={() => {
                submenu = 1;
            }}
            class="p2 flex-1 border-r border-darkborderc"
            class:bg-darkbutton={submenu === 1}
        >
            <span>{language.sizeAndSpeed}</span>
        </button>
        <button
            onclick={() => {
                submenu = 2;
            }}
            class="p-2 flex-1 border-r border-darkborderc"
            class:bg-darkbutton={submenu === 2}
        >
            <span>{language.others}</span>
        </button>
    </div>
{/if}

{#if submenu === 0 || submenu === -1}
    <SettingRenderer items={displayThemeSettingsItems} />
{/if}

{#if submenu === 1 || submenu === -1}
    <SettingRenderer items={displaySizeSettingsItems} />
{/if}

{#if submenu === 2 || submenu === -1}
    <SettingRenderer items={displayOtherSettingsItems} />
{/if}
