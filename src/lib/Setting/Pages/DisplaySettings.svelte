<script lang="ts">
    import SettingRenderer from "../SettingRenderer.svelte";
    import { displaySettingsItems } from "src/ts/setting/displaySettingsData";
</script>

<SettingRenderer items={displaySettingsItems} />