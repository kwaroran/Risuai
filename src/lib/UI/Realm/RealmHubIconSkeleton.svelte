<script lang="ts">
    interface Props {
        count: number;
    }

    let { count }: Props = $props();
</script>

<!-- Loading placeholders with the same box as RealmHubIcon, so nothing moves when the real cards arrive.
     Render inside the same flex container the cards use. -->
{#each { length: count } as _}
    <div class="bg-darkbg rounded-lg p-4 flex gap-2 lg:w-96 w-full h-28 sm:h-36 animate-pulse motion-reduce:animate-none" aria-hidden="true">
        <div class="w-20 min-w-20 h-20 sm:h-28 sm:w-28 sm:min-w-28 rounded-md bg-textcolor/10"></div>
        <div class="flex flex-col grow min-w-0 gap-2 pt-1">
            <div class="h-5 w-1/2 rounded-md bg-textcolor/10"></div>
            <div class="h-3 w-4/5 rounded-md bg-textcolor/10"></div>
            <div class="h-3 w-1/3 rounded-md bg-textcolor/10"></div>
        </div>
    </div>
{/each}
