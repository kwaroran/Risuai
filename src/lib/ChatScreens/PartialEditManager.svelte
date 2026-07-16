<script lang="ts">
    import { CheckIcon, XIcon } from '@lucide/svelte';
    import { onDestroy, untrack } from 'svelte';
    import { DBState, ReloadChatPointer } from 'src/ts/stores.svelte';
    import type { Message } from 'src/ts/storage/database.svelte';
    import { language } from 'src/lang';
    import {
        findAllOriginalRangesFromHtml,
        findAllOriginalRangesFromText,
        replaceRange,
        EDITABLE_BLOCK_SELECTORS,
        type RangeResult,
        type RangeResultWithContext
    } from 'src/ts/parser/partialEdit';

    interface Props {
        screenRoot: HTMLElement | null;
        messages: Message[];
        characterIndex: number;
        chatPage: number;
        chatId?: string | null;
        blockEditEnabled?: boolean;
        dragEditEnabled?: boolean;
    }

    interface PartialEditTarget {
        characterIndex: number;
        chatPage: number;
        chatId: string | null;
        messageIndex: number;
        messageId: string | null;
        messageData: string;
        chatRoot: HTMLElement;
        bodyRoot: HTMLElement;
    }

    let {
        screenRoot,
        messages,
        characterIndex,
        chatPage,
        chatId = null,
        blockEditEnabled = false,
        dragEditEnabled = false,
    }: Props = $props();

    const MIN_DRAG_SELECTION_LENGTH = 5;
    const SELECTOR = EDITABLE_BLOCK_SELECTORS.join(', ');

    let isEditing = $state(false);
    let editText = $state('');
    let textareaRef: HTMLTextAreaElement | null = $state(null);
    let isConfirmingDelete = $state(false);
    let showMatchFailedModal = $state(false);
    let messageData = $state('');

    type MatchingMode = 'edit' | 'delete' | null;
    let matchingState = $state<{
        mode: MatchingMode;
        targetElement: HTMLElement | null;
        originalHTML: string;
        foundMatches: RangeResultWithContext[];
        selectedRange: RangeResult | null;
    }>({
        mode: null,
        targetElement: null,
        originalHTML: '',
        foundMatches: [],
        selectedRange: null,
    });

    let activeTarget: PartialEditTarget | null = null;
    let blockButtonWrapper: HTMLDivElement | null = null;
    let currentHoveredBlock: HTMLElement | null = null;
    let dragButtonWrapper: HTMLDivElement | null = null;
    let currentDragSelectedText = '';
    let rafId: number | null = null;
    let selectionTimer: ReturnType<typeof setTimeout> | null = null;
    let focusTimer: ReturnType<typeof setTimeout> | null = null;
    let scrollTimer: ReturnType<typeof setTimeout> | null = null;

    function emptyMatchingState() {
        return {
            mode: null as MatchingMode,
            targetElement: null as HTMLElement | null,
            originalHTML: '',
            foundMatches: [] as RangeResultWithContext[],
            selectedRange: null as RangeResult | null,
        };
    }

    function hasOpenInteraction() {
        return isEditing || isConfirmingDelete || matchingState.mode !== null || showMatchFailedModal;
    }

    function hasTextContent(el: HTMLElement): boolean {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('button').forEach(btn => btn.remove());
        return !!clone.textContent?.trim();
    }

    function createButton(
        className: string,
        onEdit: () => void,
        onDelete: () => void,
        onMouseLeave?: (e: MouseEvent) => void,
    ): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.className = className;
        wrapper.innerHTML = `
            <button type="button" class="partial-edit-btn partial-edit-btn-edit">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    <path d="m15 5 4 4"/>
                </svg>
            </button>
            <button type="button" class="partial-edit-btn partial-edit-btn-delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 6h18"/>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                    <line x1="10" y1="11" x2="10" y2="17"/>
                    <line x1="14" y1="11" x2="14" y2="17"/>
                </svg>
            </button>
        `;

        const editBtn = wrapper.querySelector('.partial-edit-btn-edit')!;
        editBtn.setAttribute('title', language.partialEdit.editButtonTooltip);
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            onEdit();
        });

        const deleteBtn = wrapper.querySelector('.partial-edit-btn-delete')!;
        deleteBtn.setAttribute('title', language.partialEdit.deleteButtonTooltip);
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete();
        });

        if (onMouseLeave) wrapper.addEventListener('mouseleave', onMouseLeave);
        return wrapper;
    }

    function resolveTarget(element: Element | null): PartialEditTarget | null {
        if (!element || !screenRoot) return null;
        const bodyRoot = element.closest('.chattext') as HTMLElement | null;
        const chatRoot = element.closest('.risu-chat[data-chat-index]') as HTMLElement | null;
        if (!bodyRoot || !chatRoot || !screenRoot.contains(chatRoot) || !chatRoot.contains(bodyRoot)) return null;

        if (chatRoot.dataset.partialEditDisabled === 'true') return null;
        const messageIndex = Number.parseInt(chatRoot.dataset.chatIndex ?? '', 10);
        if (!Number.isInteger(messageIndex) || messageIndex < 0) return null;
        const messageRef = messages[messageIndex];
        if (!messageRef) return null;

        return {
            characterIndex,
            chatPage,
            chatId: chatId ?? null,
            messageIndex,
            messageId: messageRef.chatId ?? null,
            messageData: messageRef.data,
            chatRoot,
            bodyRoot,
        };
    }

    function getCurrentMessage(target: PartialEditTarget): Message | null {
        const character = DBState.db.characters[target.characterIndex];
        const chat = character?.chats?.[target.chatPage];
        if (!character || !chat) return null;
        if (target.chatId && chat.id !== target.chatId) return null;
        const message = chat.message?.[target.messageIndex];
        if (!message) return null;
        if (target.messageId && message.chatId !== target.messageId) return null;
        return message;
    }

    function validateTarget(target = activeTarget, requireDom = true): target is PartialEditTarget {
        if (!target || target.characterIndex !== characterIndex || target.chatPage !== chatPage) return false;
        if ((target.chatId ?? null) !== (chatId ?? null)) return false;
        const currentMessage = getCurrentMessage(target);
        if (!currentMessage || currentMessage.data !== target.messageData) return false;
        if (requireDom && (!screenRoot || target.chatRoot.dataset.partialEditDisabled === 'true' ||
            !target.chatRoot.isConnected || !target.bodyRoot.isConnected ||
            !screenRoot.contains(target.chatRoot) || !target.chatRoot.contains(target.bodyRoot))) return false;
        return true;
    }

    function setActiveTarget(target: PartialEditTarget) {
        activeTarget = target;
        messageData = target.messageData;
    }

    function showBlockButton(block: HTMLElement, target: PartialEditTarget) {
        if (currentHoveredBlock === block && blockButtonWrapper?.style.display === 'flex') return;
        setActiveTarget(target);
        currentHoveredBlock = block;

        if (!blockButtonWrapper) {
            blockButtonWrapper = createButton(
                'partial-edit-btn-wrapper',
                startBlockEdit,
                startBlockDelete,
                (e: MouseEvent) => {
                    const relatedTarget = e.relatedTarget as HTMLElement | null;
                    if (!relatedTarget || !currentHoveredBlock?.contains(relatedTarget)) hideBlockButton();
                },
            );
            document.body.appendChild(blockButtonWrapper);
        }

        const rect = block.getBoundingClientRect();
        blockButtonWrapper.style.position = 'fixed';
        blockButtonWrapper.style.top = `${rect.top - 36}px`;
        blockButtonWrapper.style.left = `${rect.left}px`;
        blockButtonWrapper.style.display = 'flex';
        blockButtonWrapper.style.gap = '4px';
        blockButtonWrapper.style.zIndex = '1000';
    }

    function hideBlockButton() {
        if (blockButtonWrapper) blockButtonWrapper.style.display = 'none';
        currentHoveredBlock = null;
        if (!hasOpenInteraction() && !currentDragSelectedText) activeTarget = null;
    }

    function showDragButton(rect: DOMRect, target: PartialEditTarget) {
        setActiveTarget(target);
        if (!dragButtonWrapper) {
            dragButtonWrapper = createButton(
                'partial-edit-btn-wrapper partial-edit-drag-btn-wrapper',
                startDragEdit,
                startDragDelete,
            );
            document.body.appendChild(dragButtonWrapper);
        }

        const centerX = (rect.left + rect.right) / 2;
        dragButtonWrapper.style.position = 'fixed';
        dragButtonWrapper.style.top = `${rect.bottom + 4}px`;
        dragButtonWrapper.style.left = `${centerX - 36}px`;
        dragButtonWrapper.style.display = 'flex';
        dragButtonWrapper.style.gap = '4px';
        dragButtonWrapper.style.zIndex = '1000';
    }

    function hideDragButton() {
        if (dragButtonWrapper) dragButtonWrapper.style.display = 'none';
        currentDragSelectedText = '';
        if (!hasOpenInteraction() && !currentHoveredBlock) activeTarget = null;
    }

    function clearTimers() {
        if (rafId !== null) cancelAnimationFrame(rafId);
        if (selectionTimer) clearTimeout(selectionTimer);
        if (focusTimer) clearTimeout(focusTimer);
        if (scrollTimer) clearTimeout(scrollTimer);
        rafId = null;
        selectionTimer = null;
        focusTimer = null;
        scrollTimer = null;
    }

    function resetInteraction(removeButtons = false) {
        clearTimers();
        hideBlockButton();
        hideDragButton();
        isEditing = false;
        isConfirmingDelete = false;
        showMatchFailedModal = false;
        editText = '';
        matchingState = emptyMatchingState();
        activeTarget = null;
        messageData = '';
        if (removeButtons) {
            blockButtonWrapper?.remove();
            dragButtonWrapper?.remove();
            blockButtonWrapper = null;
            dragButtonWrapper = null;
        }
    }

    function ensureValidTarget() {
        if (validateTarget()) return true;
        resetInteraction();
        return false;
    }

    function findAndProcessMatches(
        mode: MatchingMode,
        elementOrText: HTMLElement | string,
        proceedCallback: (match: RangeResultWithContext) => void,
    ) {
        if (!elementOrText || !ensureValidTarget()) return;
        matchingState.mode = mode;
        const options = mode === 'edit'
            ? { extendToEOL: false, snapStartToPrevEOL: false }
            : { extendToEOL: true, snapStartToPrevEOL: true };

        if (typeof elementOrText === 'string') {
            matchingState.targetElement = null;
            matchingState.originalHTML = '';
            matchingState.foundMatches = findAllOriginalRangesFromText(messageData, elementOrText, options);
        } else {
            matchingState.targetElement = elementOrText;
            matchingState.originalHTML = elementOrText.innerHTML;
            matchingState.foundMatches = findAllOriginalRangesFromHtml(messageData, elementOrText, options);
        }

        if (matchingState.foundMatches.length === 0) {
            matchingState.mode = null;
            showMatchFailedModal = true;
        } else {
            const highConfidenceMatches = matchingState.foundMatches.filter(m => m.confidence >= 0.95);
            if (highConfidenceMatches.length === 1) proceedCallback(highConfidenceMatches[0]);
            else if (matchingState.foundMatches.length === 1) proceedCallback(matchingState.foundMatches[0]);
        }
        hideBlockButton();
        hideDragButton();
    }

    function startBlockEdit() {
        if (!currentHoveredBlock || !ensureValidTarget()) return;
        findAndProcessMatches('edit', currentHoveredBlock, proceedWithEdit);
    }

    function startBlockDelete() {
        if (!currentHoveredBlock || !ensureValidTarget()) return;
        findAndProcessMatches('delete', currentHoveredBlock, proceedWithDelete);
    }

    function startDragEdit() {
        if (!currentDragSelectedText || !ensureValidTarget()) return;
        findAndProcessMatches('edit', currentDragSelectedText, proceedWithEdit);
    }

    function startDragDelete() {
        if (!currentDragSelectedText || !ensureValidTarget()) return;
        findAndProcessMatches('delete', currentDragSelectedText, proceedWithDelete);
    }

    function proceedWithEdit(match: RangeResultWithContext) {
        if (!ensureValidTarget()) return;
        matchingState.selectedRange = match;
        matchingState.mode = null;
        editText = messageData.slice(match.start, match.end);
        isEditing = true;
        focusTimer = setTimeout(() => {
            if (!textareaRef) return;
            textareaRef.focus();
            adjustHeight();
            scrollTimer = setTimeout(() => {
                const buttonsEl = textareaRef?.closest('.partial-edit-modal')?.querySelector('.partial-edit-buttons');
                if (buttonsEl) (buttonsEl as HTMLElement).scrollIntoView({ behavior: 'instant', block: 'nearest' });
            }, 200);
        }, 10);
    }

    function selectMatchAtIndex(index: number) {
        if (!ensureValidTarget()) return;
        const match = matchingState.foundMatches[index];
        if (!match) return;
        if (matchingState.mode === 'edit') proceedWithEdit(match);
        else if (matchingState.mode === 'delete') proceedWithDelete(match);
    }

    function cancelMatchSelection() {
        matchingState = emptyMatchingState();
        activeTarget = null;
        messageData = '';
    }

    function saveNewData(newData: string) {
        if (!ensureValidTarget() || !activeTarget) return;
        const target = activeTarget;
        const message = getCurrentMessage(target);
        if (!message) {
            resetInteraction();
            return;
        }
        resetInteraction();
        message.data = newData;
        ReloadChatPointer.update(value => ({
            ...value,
            [target.messageIndex]: (value[target.messageIndex] ?? 0) + 1,
        }));
    }

    function handleSave() {
        if (!matchingState.selectedRange || !ensureValidTarget()) return;
        saveNewData(replaceRange(messageData, matchingState.selectedRange, editText));
    }

    function handleCancel() {
        resetInteraction();
    }

    function proceedWithDelete(match: RangeResultWithContext) {
        if (!ensureValidTarget()) return;
        matchingState.selectedRange = match;
        matchingState.mode = null;
        isConfirmingDelete = true;
    }

    function handleConfirmDelete() {
        if (!matchingState.selectedRange || !ensureValidTarget()) return;
        let newData = replaceRange(messageData, matchingState.selectedRange, '');
        newData = newData.replace(/\n{3,}/g, '\n\n').trim();
        saveNewData(newData);
    }

    function handleCancelDelete() {
        resetInteraction();
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') handleCancel();
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSave();
    }

    function adjustHeight() {
        if (!textareaRef) return;
        textareaRef.style.height = 'auto';
        textareaRef.style.height = Math.max(60, textareaRef.scrollHeight) + 'px';
    }

    function isMouseOnBlockButton(mouseX: number, mouseY: number): boolean {
        if (!blockButtonWrapper || blockButtonWrapper.style.display === 'none') return false;
        const rect = blockButtonWrapper.getBoundingClientRect();
        return mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top && mouseY <= rect.bottom;
    }

    function isMouseInButtonZone(mouseX: number, mouseY: number, block: HTMLElement): boolean {
        const rect = block.getBoundingClientRect();
        return mouseX >= rect.left && mouseX <= rect.right && mouseY >= rect.top - 44 && mouseY < rect.top;
    }

    function handleMove(e: MouseEvent) {
        if (!blockEditEnabled || isEditing || isConfirmingDelete || matchingState.mode) return;
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
            hideBlockButton();
            return;
        }
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        if (rafId !== null) return;
        rafId = requestAnimationFrame(() => {
            rafId = null;
            if (isMouseOnBlockButton(mouseX, mouseY)) return;
            if (currentHoveredBlock && isMouseInButtonZone(mouseX, mouseY, currentHoveredBlock)) return;

            const elementAtPoint = document.elementFromPoint(mouseX, mouseY);
            const block = elementAtPoint?.closest(SELECTOR) as HTMLElement | null;
            const target = resolveTarget(block);
            if (block && target && target.bodyRoot.contains(block) && hasTextContent(block)) {
                showBlockButton(block, target);
                return;
            }
            hideBlockButton();
        });
    }

    function handleSelectionChange() {
        if (!dragEditEnabled || isEditing || isConfirmingDelete || matchingState.mode) return;
        if (selectionTimer) clearTimeout(selectionTimer);
        selectionTimer = setTimeout(() => {
            selectionTimer = null;
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || !selection.toString().trim() || selection.rangeCount === 0) {
                hideDragButton();
                return;
            }
            const range = selection.getRangeAt(0);
            const ancestor = range.commonAncestorContainer;
            const ancestorEl = ancestor.nodeType === Node.ELEMENT_NODE ? ancestor as HTMLElement : ancestor.parentElement;
            const startEl = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer as HTMLElement : range.startContainer.parentElement;
            const endEl = range.endContainer.nodeType === Node.ELEMENT_NODE ? range.endContainer as HTMLElement : range.endContainer.parentElement;
            const target = resolveTarget(ancestorEl);
            if (!target || !startEl || !endEl || !target.bodyRoot.contains(startEl) || !target.bodyRoot.contains(endEl)) {
                hideDragButton();
                return;
            }
            const rect = range.getBoundingClientRect();
            const selectedText = selection.toString();
            if ((rect.width === 0 && rect.height === 0) || selectedText.length < MIN_DRAG_SELECTION_LENGTH) {
                hideDragButton();
                return;
            }
            currentDragSelectedText = selectedText;
            showDragButton(rect, target);
        }, 150);
    }

    function handleMouseDown(e: MouseEvent) {
        if (!dragEditEnabled || hasOpenInteraction()) return;
        if (dragButtonWrapper?.contains(e.target as Node)) return;
        hideDragButton();
    }

    function handleScroll() {
        if (hasOpenInteraction()) return;
        hideBlockButton();
        hideDragButton();
    }

    function handleScreenLeave(e: MouseEvent) {
        if (hasOpenInteraction()) return;
        const relatedTarget = e.relatedTarget as HTMLElement | null;
        if (relatedTarget && blockButtonWrapper?.contains(relatedTarget)) return;
        hideBlockButton();
    }

    $effect(() => {
        if (!screenRoot) return;
        if (blockEditEnabled) document.addEventListener('mousemove', handleMove);
        if (dragEditEnabled) {
            document.addEventListener('selectionchange', handleSelectionChange);
            document.addEventListener('mousedown', handleMouseDown);
        }
        document.addEventListener('scroll', handleScroll, true);
        screenRoot.addEventListener('mouseleave', handleScreenLeave);
        return () => {
            document.removeEventListener('mousemove', handleMove);
            document.removeEventListener('selectionchange', handleSelectionChange);
            document.removeEventListener('mousedown', handleMouseDown);
            document.removeEventListener('scroll', handleScroll, true);
            screenRoot.removeEventListener('mouseleave', handleScreenLeave);
            resetInteraction(true);
        };
    });

    $effect(() => {
        const identity = `${characterIndex}:${chatPage}:${chatId ?? ''}`;
        void identity;
        untrack(() => resetInteraction());
    });

    $effect(() => {
        if (!screenRoot) return;
        const observer = new MutationObserver(() => {
            if (activeTarget && !validateTarget(activeTarget)) resetInteraction();
        });
        observer.observe(screenRoot, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['data-partial-edit-disabled'],
        });
        return () => observer.disconnect();
    });

    onDestroy(() => resetInteraction(true));
</script>

{#snippet MatchSelectionModal(mode: MatchingMode, matches: RangeResultWithContext[], title: string)}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="partial-edit-overlay" onclick={(e) => { if (e.target === e.currentTarget) cancelMatchSelection(); }}>
        <div class="partial-match-selection-modal">
            <div class="match-selection-header">
                <span class="match-selection-title">{title}</span>
                <span class="match-count">{matches.length} {language.partialEdit.matchesFound}</span>
            </div>
            <div class="match-list">
                {#each matches as match, i}
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div class="match-item" onclick={() => selectMatchAtIndex(i)}>
                        <div class="match-meta">
                            <span class="match-line">{language.partialEdit.lineNumber(match.lineNumber)}</span>
                            <span class="match-confidence" class:high-confidence={match.confidence >= 0.95} class:medium-confidence={match.confidence >= 0.7 && match.confidence < 0.95} class:low-confidence={match.confidence < 0.7}>
                                {(match.confidence * 100).toFixed(0)}%
                            </span>
                            <span class="match-method">{match.method}</span>
                        </div>
                        {#if match.contextBefore}
                            <div class="match-context-before">{match.contextBefore}</div>
                        {/if}
                        <div class="match-text">
                            {messageData.slice(match.start, match.end).slice(0, 150)}{messageData.slice(match.start, match.end).length > 150 ? '...' : ''}
                        </div>
                        {#if match.contextAfter}
                            <div class="match-context-after">{match.contextAfter}</div>
                        {/if}
                    </div>
                {/each}
            </div>
            <div class="partial-edit-buttons">
                <button
                    type="button"
                    class="partial-edit-cancel-btn"
                    onclick={cancelMatchSelection}
                >
                    <XIcon size={14} />
                    <span>{language.cancel}</span>
                </button>
            </div>
        </div>
    </div>
{/snippet}

<!-- Match failed modal -->
{#if showMatchFailedModal}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="partial-edit-overlay" onclick={(e) => { if (e.target === e.currentTarget) showMatchFailedModal = false; }}>
        <div class="partial-match-failed-modal">
            <div class="partial-match-failed-header">
                <span class="partial-match-failed-title">{language.partialEdit.matchFailedTitle}</span>
            </div>
            <p class="partial-match-failed-message">{language.partialEdit.matchFailedMessage}</p>
            <div class="partial-edit-buttons">
                <button
                    type="button"
                    class="partial-edit-save-btn"
                    onclick={() => showMatchFailedModal = false}
                >
                    <CheckIcon size={14} />
                    <span>{language.confirm}</span>
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Delete confirmation modal -->
{#if isConfirmingDelete}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="partial-edit-overlay" onclick={(e) => { if (e.target === e.currentTarget) handleCancelDelete(); }}>
        <div class="partial-delete-modal">
            <div class="partial-delete-header">
                <span class="partial-delete-title">{language.partialEdit.deleteModalTitle}</span>
                <div class="partial-match-meta">
                    <span class="partial-match-hint">
                        {language.partialEdit.matchFound(matchingState.selectedRange.method)}
                    </span>
                    <span class="partial-match-confidence" class:low-confidence={matchingState.selectedRange.confidence < 0.7}>
                        {(matchingState.selectedRange.confidence * 100).toFixed(0)}%
                    </span>
                </div>
            </div>
            <p class="partial-delete-message">{language.partialEdit.deleteConfirmMessage}</p>
            <div class="partial-delete-preview">
                {matchingState.selectedRange ? messageData.slice(matchingState.selectedRange.start, matchingState.selectedRange.end).slice(0, 200) : ''}{matchingState.selectedRange && messageData.slice(matchingState.selectedRange.start, matchingState.selectedRange.end).length > 200 ? '...' : ''}
            </div>
            <div class="partial-edit-buttons">
                <button
                    type="button"
                    class="partial-delete-confirm-btn"
                    onclick={handleConfirmDelete}
                >
                    <CheckIcon size={14} />
                    <span>{language.partialEdit.deleteYes}</span>
                </button>
                <button
                    type="button"
                    class="partial-edit-cancel-btn"
                    onclick={handleCancelDelete}
                >
                    <XIcon size={14} />
                    <span>{language.partialEdit.deleteNo}</span>
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Match selection modal (shared for edit/delete) -->
{#if matchingState.mode === 'edit'}
    {@render MatchSelectionModal('edit', matchingState.foundMatches, language.partialEdit.selectMatch)}
{:else if matchingState.mode === 'delete'}
    {@render MatchSelectionModal('delete', matchingState.foundMatches, language.partialEdit.selectDeleteMatch)}
{/if}

<!-- Edit modal (shown only during edit) -->
{#if isEditing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="partial-edit-overlay" onclick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
        <div class="partial-edit-modal">
            <div class="partial-edit-header">
                <span class="partial-edit-title">{language.partialEdit.editModalTitle}</span>
                <div class="partial-match-meta">
                    <span class="partial-match-hint">
                        {language.partialEdit.matchFound(matchingState.selectedRange.method)}
                    </span>
                    <span class="partial-match-confidence" class:low-confidence={matchingState.selectedRange.confidence < 0.7}>
                        {(matchingState.selectedRange.confidence * 100).toFixed(0)}%
                    </span>
                </div>
            </div>
            <textarea
                bind:this={textareaRef}
                bind:value={editText}
                class="partial-edit-textarea"
                onkeydown={handleKeydown}
                oninput={adjustHeight}
                style:font-size="{0.875 * (DBState.db.zoomsize / 100)}rem"
                style:line-height="{(DBState.db.lineHeight ?? 1.25) * (DBState.db.zoomsize / 100)}rem"
            ></textarea>
            <div class="partial-edit-buttons">
                <button
                    type="button"
                    class="partial-edit-save-btn"
                    onclick={handleSave}
                    title="{language.partialEdit.saveShortcut}"
                >
                    <CheckIcon size={14} />
                    <span>{language.partialEdit.save}</span>
                </button>
                <button
                    type="button"
                    class="partial-edit-cancel-btn"
                    onclick={handleCancel}
                    title="{language.partialEdit.cancelShortcut}"
                >
                    <XIcon size={14} />
                    <span>{language.partialEdit.cancel}</span>
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.partial-edit-btn-wrapper) {
        display: none;
    }

    :global(.partial-edit-btn) {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        padding: 8px;
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid rgba(0, 0, 0, 0.15);
        border-radius: 6px;
        cursor: pointer;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        transition: all 0.15s ease;
        color: #666;
    }

    :global(.partial-edit-btn-edit:hover) {
        background: #e0f2fe;
        border-color: #3b82f6;
        color: #3b82f6;
    }

    :global(.partial-edit-btn-delete:hover) {
        background: #fee2e2;
        border-color: #ef4444;
        color: #ef4444;
    }

    .partial-match-failed-modal {
        background: var(--risu-theme-bgcolor, #fff);
        border-radius: 12px;
        padding: 20px;
        width: 50vw;
        max-width: 500px;
        min-width: 320px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .partial-match-failed-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .partial-match-failed-title {
        font-weight: 600;
        font-size: 16px;
        color: var(--risu-theme-textcolor, #000);
    }

    .partial-match-failed-message {
        font-size: 14px;
        color: var(--risu-theme-textcolor, #000);
        margin: 0;
        line-height: 1.5;
    }

    .partial-delete-modal {
        background: var(--risu-theme-bgcolor, #fff);
        border-radius: 12px;
        padding: 20px;
        width: 50vw;
        max-width: 1600px;
        min-width: 400px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .partial-delete-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .partial-delete-title {
        font-weight: 600;
        font-size: 16px;
        color: var(--risu-theme-textcolor, #000);
    }

    .partial-delete-message {
        font-size: 14px;
        color: var(--risu-theme-textcolor, #000);
        margin: 0;
    }

    .partial-delete-preview {
        padding: 12px;
        background: var(--risu-theme-darkbg, #f5f5f5);
        border-radius: 8px;
        font-size: 13px;
        color: var(--risu-theme-textcolor, #000);
        max-height: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .partial-delete-confirm-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        background: #ef4444;
        color: white;
    }

    .partial-delete-confirm-btn:hover {
        background: #dc2626;
    }

    .partial-edit-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
    }

    .partial-edit-modal {
        background: var(--risu-theme-bgcolor, #fff);
        border-radius: 12px;
        padding: 20px;
        width: 50vw;
        max-width: 1600px;
        min-width: 400px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        gap: 12px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .partial-edit-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .partial-edit-title {
        font-weight: 600;
        font-size: 16px;
        color: var(--risu-theme-textcolor, #000);
    }

    .partial-match-meta {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .partial-match-hint {
        font-size: 12px;
        color: var(--risu-theme-textcolor, #000);
    }

    .partial-match-confidence {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: 4px;
        background: #10b981;
        color: white;
    }

    .partial-match-confidence.low-confidence {
        background: #f59e0b;
    }

    .partial-edit-textarea {
        width: 100%;
        min-height: 120px;
        max-height: 50vh;
        padding: 12px;
        border: 1px solid var(--risu-theme-darkborderc, #ddd);
        border-radius: 8px;
        background: var(--risu-theme-darkbg, #f5f5f5);
        color: var(--risu-theme-textcolor, #000);
        font-family: inherit;
        resize: vertical;
        box-sizing: border-box;
    }

    .partial-edit-textarea:focus {
        outline: none;
        border-color: #3b82f6;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
    }

    .partial-edit-buttons {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
    }

    .partial-edit-save-btn,
    .partial-edit-cancel-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .partial-edit-save-btn {
        background: #3b82f6;
        color: white;
    }

    .partial-edit-save-btn:hover {
        background: #2563eb;
    }

    .partial-edit-cancel-btn {
        background: #6b7280;
        color: white;
    }

    .partial-edit-cancel-btn:hover {
        background: #4b5563;
    }

    /* Match Selection Modal */
    .partial-match-selection-modal {
        background: var(--risu-theme-bgcolor, #fff);
        border-radius: 12px;
        padding: 20px;
        width: 50vw;
        max-width: 1200px;
        min-width: 400px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .match-selection-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--risu-theme-darkborderc, #ddd);
    }

    .match-selection-title {
        font-weight: 600;
        font-size: 16px;
        color: var(--risu-theme-textcolor, #000);
    }

    .match-count {
        font-size: 13px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 12px;
        background: var(--risu-theme-darkbg, #f5f5f5);
        color: var(--risu-theme-textcolor, #000);
    }

    .match-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        overflow-y: auto;
        max-height: calc(80vh - 160px);
        padding: 4px;
    }

    .match-item {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px;
        border: 1px solid var(--risu-theme-darkborderc, #ddd);
        border-radius: 8px;
        background: var(--risu-theme-darkbg, #f9f9f9);
        cursor: pointer;
        transition: all 0.15s ease;
    }

    .match-item:hover {
        background: var(--risu-theme-bgcolor, #fff);
        border-color: #3b82f6;
        box-shadow: 0 2px 8px rgba(59, 130, 246, 0.2);
        transform: translateY(-1px);
    }

    .match-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
    }

    .match-line {
        font-size: 12px;
        font-weight: 500;
        color: var(--risu-theme-textcolor, #000);
        background: var(--risu-theme-bgcolor, #fff);
        padding: 2px 8px;
        border-radius: 4px;
    }

    .match-confidence {
        font-size: 11px;
        font-weight: 600;
        padding: 3px 8px;
        border-radius: 4px;
        color: white;
    }

    .match-confidence.high-confidence {
        background: #10b981;
    }

    .match-confidence.medium-confidence {
        background: #3b82f6;
    }

    .match-confidence.low-confidence {
        background: #f59e0b;
    }

    .match-method {
        font-size: 11px;
        font-weight: 500;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--risu-theme-bgcolor, #fff);
        color: var(--risu-theme-textcolor, #000);
        font-family: monospace;
    }

    .match-context-before,
    .match-context-after {
        font-size: 12px;
        color: var(--risu-theme-textcolor, #000);
        padding: 8px 12px;
        background: var(--risu-theme-bgcolor, #fff);
        border-radius: 6px;
        border-left: 3px solid var(--risu-theme-darkborderc, #ddd);
        line-height: 1.5;
        font-style: italic;
        white-space: pre-line;
    }

    .match-text {
        font-size: 13px;
        color: var(--risu-theme-textcolor, #000);
        padding: 10px 12px;
        background: var(--risu-theme-bgcolor, #fff);
        border-radius: 6px;
        border-left: 3px solid #3b82f6;
        line-height: 1.5;
        font-weight: 500;
        white-space: pre-line;
    }
</style>
