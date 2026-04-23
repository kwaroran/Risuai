<script lang="ts">
    import Button from "src/lib/UI/GUI/Button.svelte";
    import { customSideBarConfigDialogStore } from "src/ts/stores.svelte";
    import { language } from "src/lang";

</script>
<Button onclick={() => {
    customSideBarConfigDialogStore.open = true

}}>
    {language.customSidebarConfig}
</Button>