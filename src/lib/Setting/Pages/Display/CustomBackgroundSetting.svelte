<script lang="ts">
    import { language } from "src/lang";
    import { DBState } from "src/ts/stores.svelte";
    import Check from "src/lib/UI/GUI/CheckInput.svelte";
    import { saveImage } from "src/ts/storage/database.svelte";
    import { selectSingleFile } from "src/ts/util";
</script>

<div class="flex items-center mt-2">
    <Check check={DBState.db.customBackground !== ''} onChange={async (check) => {
        if(check){
            DBState.db.customBackground = '-'
            const d = await selectSingleFile(['png', 'webp', 'gif'])
            if(!d){
                DBState.db.customBackground = ''
                return
            }
            const img = await saveImage(d.data)
            DBState.db.customBackground = img
        }
        else{
            DBState.db.customBackground = ''
        }
    }} name={language.useCustomBackground}></Check>
</div>
