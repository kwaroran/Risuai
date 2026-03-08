<script lang="ts">
    import { DBState } from 'src/ts/stores.svelte';
    import { language } from 'src/lang';
    import { saveImage } from 'src/ts/storage/database.svelte';
    import { selectSingleFile } from 'src/ts/util';
    import Check from 'src/lib/UI/GUI/CheckInput.svelte';
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
