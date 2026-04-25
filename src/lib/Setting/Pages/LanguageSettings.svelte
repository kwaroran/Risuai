<script lang="ts">
    import { languageSettingsItems } from "src/ts/setting/languageSettingsData.svelte";
    import SettingRenderer from "../SettingRenderer.svelte";
</script>

<SettingRenderer items={languageSettingsItems} />
