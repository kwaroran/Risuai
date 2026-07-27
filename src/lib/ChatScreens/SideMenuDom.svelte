<script lang="ts">
    import DOMPurify from "dompurify";
    import { Idiomorph } from "idiomorph";
    import { DBState, moduleSideMenuEmbedding, selIdState } from "src/ts/stores.svelte";

    let host = $state<HTMLDivElement>();
    let lastRenderedHTML = "";

    let sideMenuEmbedding = $derived(
        selIdState.selId > -1
            ? `${DBState.db?.characters?.[selIdState.selId]?.sideMenuHTML ?? ""}\n${$moduleSideMenuEmbedding ?? ""}`
            : "",
    );

    $effect(() => {
        if (!host) {
            return;
        }

        const sanitizedHTML = DOMPurify.sanitize(sideMenuEmbedding, {
            ADD_TAGS: ["iframe", "style", "risu-style"],
            ADD_ATTR: [
                "allow",
                "allowfullscreen",
                "frameborder",
                "scrolling",
                "risu-ctrl",
                "risu-btn",
                "risu-trigger",
                "risu-id",
            ],
        });

        if (sanitizedHTML === lastRenderedHTML) {
            return;
        }

        Idiomorph.morph(host, sanitizedHTML, {
            morphStyle: "innerHTML",
            restoreFocus: true,
            ignoreActiveValue: true,
        });
        lastRenderedHTML = sanitizedHTML;
    });
</script>

<div
    bind:this={host}
    class="absolute top-0 right-0 h-full pointer-events-none"
    data-risu-side-menu
></div>
<style>
    :global([data-risu-side-menu] > :not(style)) {
        pointer-events: auto;
    }
</style>