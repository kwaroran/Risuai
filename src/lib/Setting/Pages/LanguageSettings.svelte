<script lang="ts">
    import { onDestroy } from "svelte";
    import { langState, languageSettingsItems } from "src/ts/setting/languageSettingsData.svelte";
    import SettingRenderer from "../SettingRenderer.svelte";

    onDestroy(() => {
        langState.changed = false;
    });
</script>

<SettingRenderer items={languageSettingsItems} />
