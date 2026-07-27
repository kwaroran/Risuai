<script lang="ts">
    import { Idiomorph } from "idiomorph";
    import { ParseMarkdown, risuChatParser, trimMarkdown } from "src/ts/parser/parser.svelte";
    import { runLuaButtonTrigger } from "src/ts/process/scriptings";
    import { runTrigger } from "src/ts/process/triggers";
    import {
        getCurrentCharacter,
        getCurrentChat,
        setCurrentChat,
    } from "src/ts/storage/database.svelte";
    import {
        CurrentTriggerIdStore,
        DBState,
        moduleSideMenuEmbedding,
        ReloadGUIPointer,
        selIdState,
    } from "src/ts/stores.svelte";

    let host = $state<HTMLDivElement>();
    let lastRenderedHTML = "";
    let renderVersion = 0;

    let currentChar = $derived(DBState.db?.characters?.[selIdState.selId]);
    let sideMenuEmbedding = $derived(
        selIdState.selId > -1
            ? `${currentChar?.sideMenuHTML ?? ""}\n${$moduleSideMenuEmbedding ?? ""}`
            : "",
    );

    function preserveInteractiveAttribute(attributeName: string, node: Element) {
        if (
            (node instanceof HTMLInputElement && ["value", "checked"].includes(attributeName)) ||
            (node instanceof HTMLTextAreaElement && attributeName === "value") ||
            (node instanceof HTMLOptionElement && attributeName === "selected") ||
            (node instanceof HTMLDetailsElement && attributeName === "open")
        ) {
            return false;
        }
    }

    function preserveEditableContent(oldNode: Node) {
        if (oldNode instanceof HTMLElement && oldNode.isContentEditable) {
            return false;
        }
    }

    $effect(() => {
        if (!host) {
            return;
        }

        const source = sideMenuEmbedding;
        const char = currentChar;
        const target = host;
        const reloadPointer = $ReloadGUIPointer;
        void reloadPointer;
        const version = ++renderVersion;

        void (async () => {
            const parsedSource = char
                ? risuChatParser(source, {
                      chara: char,
                      rmVar: true,
                      visualize: true,
                  })
                : source;
            const parsedHTML = await ParseMarkdown(parsedSource, char, "notrim");
            const sanitizedHTML = trimMarkdown(parsedHTML);

            if (version !== renderVersion || target !== host || sanitizedHTML === lastRenderedHTML) {
                return;
            }

            Idiomorph.morph(target, sanitizedHTML, {
                morphStyle: "innerHTML",
                restoreFocus: true,
                ignoreActiveValue: true,
                callbacks: {
                    beforeNodeMorphed: preserveEditableContent,
                    beforeAttributeUpdated: preserveInteractiveAttribute,
                },
            });
            lastRenderedHTML = sanitizedHTML;
        })().catch((error) => {
            console.error("Failed to render side menu embedding:", error);
        });
    });

    async function handleButtonTriggerWithin(event: MouseEvent) {
        const currentChar = getCurrentCharacter();
        if (!currentChar || currentChar.type === "group") {
            return;
        }

        const target = event.target as HTMLElement;
        const origin = target.closest<HTMLElement>("[risu-trigger], [risu-btn]");
        if (!origin || !host?.contains(origin)) {
            return;
        }

        const triggerName = origin.getAttribute("risu-trigger");
        const triggerId = origin.getAttribute("risu-id");
        const btnEvent = origin.getAttribute("risu-btn");

        const triggerResult = triggerName
            ? await runTrigger(currentChar, "manual", {
                  chat: getCurrentChat(),
                  manualName: triggerName,
                  triggerId: triggerId || undefined,
              })
            : btnEvent
              ? await runLuaButtonTrigger(currentChar, btnEvent)
              : null;

        if (triggerResult) {
            setCurrentChat(triggerResult.chat);
            ReloadGUIPointer.update((value) => value + 1);
        }

        if (triggerName && triggerId) {
            setTimeout(() => {
                CurrentTriggerIdStore.set(null);
            }, 100);
        }
    }
</script>

<div
    bind:this={host}
    class="chattext absolute top-0 right-0 h-full pointer-events-none"
    data-risu-side-menu
    onclickcapture={handleButtonTriggerWithin}
></div>

<style>
    :global([data-risu-side-menu] > :not(style)) {
        pointer-events: auto;
    }
</style>
