<script lang="ts">
    import {
        BookmarkIcon,
        CopyIcon,
        LanguagesIcon,
        PencilIcon,
        PlusIcon,
        PowerOff,
        Scissors,
        SplitIcon,
        TrashIcon,
        Volume2Icon,
    } from '@lucide/svelte';
    import Sortable from 'sortablejs';
    import { language } from 'src/lang';
    import { alertConfirm } from 'src/ts/alert';
    import { DBState } from 'src/ts/stores.svelte';
    import { sortableOptions } from 'src/ts/util';
    import {
        messageActionPlaces,
        moveMessageAction,
        normalizeMessageActions,
        type MessageActionId,
        type MessageActionPlace,
        type MessageActionSetting,
    } from 'src/ts/messageActions';
    import Accordion from 'src/lib/UI/Accordion.svelte';
    import Button from 'src/lib/UI/GUI/Button.svelte';

    const DROPPED_HIGHLIGHT_MS = 1200;

    const places: Record<MessageActionPlace, { label: string; chipClass: string }> = {
        always: { label: language.messageActionsAlways, chipClass: 'border-transparent bg-textcolor text-bgcolor' },
        wide: { label: language.messageActionsWide, chipClass: 'border-transparent bg-textcolor/15 text-textcolor' },
        menu: { label: language.messageActionsMenu, chipClass: 'border-darkborderc text-textcolor' },
        hidden: { label: language.messageActionsHidden, chipClass: 'border-dashed border-darkborderc text-textcolor2' },
    };
    const buttons: Record<MessageActionId, { label: string; icon: typeof CopyIcon }> = {
        translate: { label: language.hotkeyDesc.translate, icon: LanguagesIcon },
        edit: { label: language.edit, icon: PencilIcon },
        copy: { label: language.copy, icon: CopyIcon },
        tts: { label: 'TTS', icon: Volume2Icon },
        remove: { label: language.remove, icon: TrashIcon },
        bookmark: { label: language.bookmark, icon: BookmarkIcon },
        branch: { label: language.branch, icon: SplitIcon },
        disable: { label: language.disableMessage, icon: PowerOff },
        cut: { label: language.disableAbove, icon: Scissors },
    };

    let actions = $derived(normalizeMessageActions(DBState.db.messageActions));
    let lifted = $state<MessageActionId | null>(null);
    let dropped = $state<MessageActionId | null>(null);
    let droppedTimer: ReturnType<typeof setTimeout>;

    function moveTo(id: MessageActionId, place: MessageActionPlace, beforeId?: MessageActionId) {
        DBState.db.messageActions = moveMessageAction(actions, id, place, beforeId);
        dropped = id;
        lifted = null;
        clearTimeout(droppedTimer);
        droppedTimer = setTimeout(() => {
            dropped = null;
        }, DROPPED_HIGHLIGHT_MS);
    }

    function tapChip(action: MessageActionSetting) {
        if (lifted === null) {
            lifted = action.id;
        } else if (lifted === action.id) {
            lifted = null;
        } else {
            moveTo(lifted, action.place, action.id);
        }
    }

    function sortableGroup(element: HTMLElement) {
        let startNextNode: Node | null = null;
        const sortable = Sortable.create(element, {
            ...sortableOptions,
            // Shorter touch hold than the shared 300ms.
            delay: 70,
            group: 'messageActions',
            draggable: '[data-action]',
            animation: 150,
            // No browser drag image; the chip itself moves.
            forceFallback: true,
            fallbackOnBody: true,
            fallbackTolerance: 3,
            fallbackClass: 'message-action-fallback',
            ghostClass: 'message-action-ghost',
            chosenClass: 'message-action-chosen',
            onStart: (event) => {
                // A node rather than an index: the last chip must stay before Svelte's list anchor.
                startNextNode = event.item.nextSibling;
            },
            onEnd: (event) => {
                if (event.from === event.to && event.oldIndex === event.newIndex) {
                    return;
                }
                const next = event.item.nextElementSibling as HTMLElement | null;
                // Cancel the slide animation and put the chip back, so Svelte is the only one moving DOM nodes.
                for (const child of [...event.from.children, ...event.to.children] as HTMLElement[]) {
                    child.style.transform = '';
                    child.style.transition = '';
                }
                event.from.insertBefore(event.item, startNextNode);
                moveTo(
                    event.item.dataset.action as MessageActionId,
                    event.to.dataset.place as MessageActionPlace,
                    next?.dataset.action as MessageActionId | undefined,
                );
            },
        });
        return { destroy: () => sortable.destroy() };
    }

    async function reset() {
        if (await alertConfirm(language.messageActionsResetConfirm)) {
            DBState.db.messageActions = undefined;
            lifted = null;
        }
    }
</script>

<Accordion styled name={language.messageActions}>
    <p class="text-textcolor2 text-sm mt-1 mb-1">
        {lifted === null ? language.messageActionsPick : language.messageActionsDrop}
    </p>
    {#each messageActionPlaces as place (place)}
        <div class="flex flex-col sm:flex-row items-start gap-1 sm:gap-3 py-2 border-b border-darkborderc">
            <span class="sm:w-24 shrink-0 text-textcolor2 text-sm sm:pt-1.5">{places[place].label}</span>
            <div class="grow w-full min-w-0 min-h-8 flex flex-wrap items-center gap-1.5" data-place={place} use:sortableGroup>
                {#each actions.filter((v) => v.place === place) as action (action.id)}
                    {@const Icon = buttons[action.id].icon}
                    {@const highlighted = lifted === action.id || dropped === action.id}
                    <button
                        class="flex items-center gap-1.5 px-2.5 py-1 text-sm whitespace-nowrap rounded-md border ring-blue-500 transition-shadow {highlighted ? 'ring-2' : 'hover:ring-1'} {places[place].chipClass}"
                        data-action={action.id}
                        aria-pressed={lifted === action.id}
                        onclick={() => tapChip(action)}
                    >
                        <Icon size={16} />
                        {buttons[action.id].label}
                    </button>
                {:else}
                    {#if lifted === null}
                        <span class="text-textcolor2 text-sm">{language.none}</span>
                    {/if}
                {/each}
                {#if lifted !== null}
                    <button
                        class="grow min-w-14 min-h-8 flex items-center justify-center rounded-md border border-dashed border-blue-500/60 text-blue-500 hover:bg-blue-500/10"
                        aria-label="Move to the end of this group"
                        onclick={() => moveTo(lifted, place)}
                    >
                        <PlusIcon size={16} />
                    </button>
                {/if}
            </div>
        </div>
    {/each}
    <Button className="mt-3" onclick={reset}>{language.messageActionsReset}</Button>
</Accordion>

<style>
    :global(.message-action-fallback) {
        opacity: 0 !important;
    }

    :global(.message-action-ghost) {
        outline: 2px solid var(--color-blue-500);
    }

    /* Touch only: a mouse has no delay, so this would flash on every click. */
    @media (pointer: coarse) {
        :global(.message-action-chosen) {
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
        }
    }
</style>
