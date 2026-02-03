<script lang="ts">
    import { CheckIcon, XIcon } from '@lucide/svelte';
    import { createEventDispatcher, onDestroy } from 'svelte';
    import { DBState } from 'src/ts/stores.svelte';
    import { language } from 'src/lang';
    import { 
        findOriginalRangeFromHtml, 
        htmlToPlain,
        replaceRange,
        EDITABLE_BLOCK_SELECTORS,
        type RangeResult 
    } from 'src/ts/parser/partialEdit';

    interface Props {
        /** 채팅 메시지 원본 데이터 */
        messageData: string;
        /** 채팅 인덱스 */
        chatIndex: number;
        /** 렌더링된 HTML을 포함하는 루트 요소 */
        bodyRoot: HTMLElement | null;
        /** 부분 수정 활성화 여부 */
        enabled?: boolean;
    }

    let {
        messageData = $bindable(''),
        chatIndex,
        bodyRoot,
        enabled = true,
    }: Props = $props();

    const dispatch = createEventDispatcher<{
        save: { newData: string };
    }>();

    // 편집 상태
    let isEditing = $state(false);
    let editingElement: HTMLElement | null = $state(null);
    let editText = $state('');
    let foundRange: RangeResult | null = $state(null);
    let originalHTML = $state('');
    let textareaRef: HTMLTextAreaElement | null = $state(null);

    // 삭제 확인 상태
    let isConfirmingDelete = $state(false);
    let deleteTargetElement: HTMLElement | null = $state(null);
    let deleteRange: RangeResult | null = $state(null);

    const SELECTOR = EDITABLE_BLOCK_SELECTORS.join(', ');

    // DOM에 직접 추가할 버튼 요소
    let buttonWrapper: HTMLDivElement | null = null;
    let currentHoveredBlock: HTMLElement | null = null;

    // 이전 블록들의 누적 텍스트 오프셋 계산
    function calculateCumulativeOffset(
        bodyRoot: HTMLElement | null,
        targetBlock: HTMLElement
    ): number {
        if (!bodyRoot) return 0;

        const allBlocks = Array.from(bodyRoot.querySelectorAll(SELECTOR)) as HTMLElement[];
        const targetIndex = allBlocks.indexOf(targetBlock);

        if (targetIndex <= 0) return 0;

        let offset = 0;
        for (let i = 0; i < targetIndex; i++) {
            const plainText = htmlToPlain(allBlocks[i]);
            offset += plainText.length;
            // 블록 사이 줄바꿈 추가 (일반적으로 \n\n으로 구분)
            offset += 2;
        }

        return offset;
    }

    // 텍스트 내용이 있는지 확인
    function hasTextContent(el: HTMLElement): boolean {
        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('button').forEach(btn => btn.remove());
        return !!clone.textContent?.trim();
    }

    // 버튼 생성
    function createButton(): HTMLDivElement {
        const wrapper = document.createElement('div');
        wrapper.className = 'partial-edit-btn-wrapper';
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
            startEdit();
        });

        const deleteBtn = wrapper.querySelector('.partial-edit-btn-delete')!;
        deleteBtn.setAttribute('title', language.partialEdit.deleteButtonTooltip);
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            startDelete();
        });

        // 버튼에서 마우스가 벗어날 때도 처리
        wrapper.addEventListener('mouseleave', (e) => {
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            if (!relatedTarget || !currentHoveredBlock?.contains(relatedTarget)) {
                hideButton();
            }
        });

        return wrapper;
    }

    // 블록에 버튼 표시
    function showButtonOnBlock(block: HTMLElement) {
        if (currentHoveredBlock === block && buttonWrapper?.style.display === 'block') return;
        
        currentHoveredBlock = block;

        if (!buttonWrapper) {
            buttonWrapper = createButton();
            document.body.appendChild(buttonWrapper);
        }

        // 버튼 위치 계산 (viewport 기준 fixed positioning)
        // 블록의 위 왼쪽에 버튼 배치
        const rect = block.getBoundingClientRect();
        const buttonHeight = 32; // 버튼 높이
        buttonWrapper.style.position = 'fixed';
        buttonWrapper.style.top = `${rect.top - buttonHeight - 4}px`;
        buttonWrapper.style.left = `${rect.left}px`;
        buttonWrapper.style.display = 'flex';
        buttonWrapper.style.gap = '4px';
        buttonWrapper.style.zIndex = '1000';
    }

    // 버튼 숨기기
    function hideButton() {
        if (buttonWrapper) {
            buttonWrapper.style.display = 'none';
        }
        currentHoveredBlock = null;
    }

    // 편집 시작
    function startEdit() {
        if (!currentHoveredBlock || !messageData) return;

        editingElement = currentHoveredBlock;
        originalHTML = currentHoveredBlock.innerHTML;
        const searchStartOffset = calculateCumulativeOffset(bodyRoot, currentHoveredBlock);

        // 원본에서 해당 범위 찾기
        const plainText = htmlToPlain(currentHoveredBlock);
        foundRange = findOriginalRangeFromHtml(messageData, currentHoveredBlock, {
            extendToEOL: false,
            snapStartToPrevEOL: false,
            searchStartOffset: searchStartOffset,
        });

        if (foundRange) {
            editText = messageData.slice(foundRange.start, foundRange.end);
        } else {
            // fallback: 평문 텍스트 사용
            editText = plainText;
        }

        isEditing = true;
        hideButton();

        // 다음 틱에 textarea 포커스
        setTimeout(() => {
            if (textareaRef) {
                textareaRef.focus();
                textareaRef.select();
                adjustHeight();
            }
        }, 10);
    }

    // 저장
    function handleSave() {
        if (!editingElement) return;

        const newData = foundRange
            ? replaceRange(messageData, foundRange, editText)
            : messageData.replace(htmlToPlain(editingElement), editText);

        dispatch('save', { newData });

        // 편집 종료
        closeEdit();
    }

    // 취소
    function handleCancel() {
        if (editingElement && originalHTML) {
            editingElement.innerHTML = originalHTML;
        }
        closeEdit();
    }

    // 편집 종료
    function closeEdit() {
        isEditing = false;
        editingElement = null;
        editText = '';
        foundRange = null;
        originalHTML = '';
    }

    // 삭제 시작
    function startDelete() {
        if (!currentHoveredBlock || !messageData) return;

        deleteTargetElement = currentHoveredBlock;
        
        const searchStartOffset = calculateCumulativeOffset(bodyRoot, currentHoveredBlock);
        
        // 원본에서 해당 범위 찾기
        deleteRange = findOriginalRangeFromHtml(messageData, currentHoveredBlock, {
            extendToEOL: true,
            snapStartToPrevEOL: true,
            searchStartOffset: searchStartOffset,
        });

        isConfirmingDelete = true;
        hideButton();
    }

    // 삭제 확인
    function handleConfirmDelete() {
        if (!deleteTargetElement) return;

        let newData: string;
        if (deleteRange) {
            newData = replaceRange(messageData, deleteRange, '');
        } else {
            const plainText = htmlToPlain(deleteTargetElement);
            newData = messageData.replace(plainText, '');
        }

        // 연속 줄바꿈 정리
        newData = newData.replace(/\n{3,}/g, '\n\n').trim();

        dispatch('save', { newData });
        closeDeleteConfirm();
    }

    // 삭제 취소
    function handleCancelDelete() {
        closeDeleteConfirm();
    }

    // 삭제 확인 종료
    function closeDeleteConfirm() {
        isConfirmingDelete = false;
        deleteTargetElement = null;
        deleteRange = null;
    }

    // 키보드 단축키
    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            handleCancel();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            handleSave();
        }
    }

    // textarea 높이 자동 조절
    function adjustHeight() {
        if (textareaRef) {
            textareaRef.style.height = 'auto';
            textareaRef.style.height = Math.max(60, textareaRef.scrollHeight) + 'px';
        }
    }

    // 마우스가 버튼 위에 있는지 확인
    function isMouseOnButton(mouseX: number, mouseY: number): boolean {
        if (!buttonWrapper || buttonWrapper.style.display === 'none') return false;
        const rect = buttonWrapper.getBoundingClientRect();
        return mouseX >= rect.left && mouseX <= rect.right &&
               mouseY >= rect.top && mouseY <= rect.bottom;
    }

    // 현재 블록의 확장 영역(버튼 자리, 블록 위쪽)에 마우스가 있는지 확인
    function isMouseInButtonZone(mouseX: number, mouseY: number, block: HTMLElement): boolean {
        const rect = block.getBoundingClientRect();
        const buttonHeight = 32;
        const gap = 4;
        const extendedTop = rect.top - buttonHeight - gap - 8;
        
        return mouseX >= rect.left && mouseX <= rect.right &&
               mouseY >= extendedTop && mouseY < rect.top;
    }

    $effect(() => {
        if (!bodyRoot || !enabled) return;

        let lastMouseX = 0;
        let lastMouseY = 0;
        let rafId: number | null = null;

        // mousemove 핸들러 - elementFromPoint로 실제 보이는 블록만 감지
        const handleMove = (e: MouseEvent) => {
            if (isEditing) return;
            
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            // RAF로 throttle
            if (rafId !== null) return;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                
                // 버튼 위에 있으면 유지
                if (isMouseOnButton(lastMouseX, lastMouseY)) {
                    return;
                }

                // 현재 호버된 블록이 있을 때
                if (currentHoveredBlock) {
                    if (isMouseInButtonZone(lastMouseX, lastMouseY, currentHoveredBlock)) {
                        return;
                    }
                }

                // 새 블록 찾기 - elementFromPoint로 실제 보이는 요소만 감지
                const elementAtPoint = document.elementFromPoint(lastMouseX, lastMouseY);
                if (elementAtPoint) {
                    const block = elementAtPoint.closest(SELECTOR) as HTMLElement | null;
                    if (block && bodyRoot.contains(block) && hasTextContent(block)) {
                        showButtonOnBlock(block);
                        return;
                    }
                }

                // elementFromPoint로 못 찾았으면, 확장 영역(버튼 자리) 체크
                const blocks = bodyRoot.querySelectorAll(SELECTOR);
                for (const block of blocks) {
                    if (isMouseInButtonZone(lastMouseX, lastMouseY, block as HTMLElement)) {
                        if (hasTextContent(block as HTMLElement)) {
                            // 이 블록이 가려져 있지 않은지 확인 (블록 상단 중앙에서 체크)
                            const rect = (block as HTMLElement).getBoundingClientRect();
                            const checkX = rect.left + rect.width / 2;
                            const checkY = rect.top + 5; // 블록 상단 근처
                            const elementAtBlock = document.elementFromPoint(checkX, checkY);
                            if (elementAtBlock && (block.contains(elementAtBlock) || elementAtBlock === block)) {
                                showButtonOnBlock(block as HTMLElement);
                                return;
                            }
                        }
                    }
                }

                hideButton();
            });
        };

        // mouseleave 핸들러 - bodyRoot를 벗어날 때
        const handleLeave = (e: MouseEvent) => {
            if (isEditing) return;
            
            const relatedTarget = e.relatedTarget as HTMLElement | null;
            
            // 버튼으로 이동하면 유지
            if (relatedTarget && buttonWrapper?.contains(relatedTarget)) {
                return;
            }
            
            hideButton();
        };

        const handleScroll = () => {
            if (isEditing) return;
            hideButton();
        };

        // document 레벨에서 mousemove 리스닝 (버튼 영역도 포함하기 위해)
        document.addEventListener('mousemove', handleMove);
        bodyRoot.addEventListener('mouseleave', handleLeave);
        document.addEventListener('scroll', handleScroll, true); // capture phase로 모든 스크롤 감지

        return () => {
            document.removeEventListener('mousemove', handleMove);
            bodyRoot.removeEventListener('mouseleave', handleLeave);
            document.removeEventListener('scroll', handleScroll, true);
            if (rafId !== null) {
                cancelAnimationFrame(rafId);
            }
        };
    });

    // 컴포넌트 언마운트 시 정리
    onDestroy(() => {
        if (buttonWrapper) {
            buttonWrapper.remove();
            buttonWrapper = null;
        }
    });
</script>

<!-- 삭제 확인 모달 -->
{#if isConfirmingDelete}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="partial-edit-overlay" onclick={(e) => { if (e.target === e.currentTarget) handleCancelDelete(); }}>
        <div class="partial-delete-modal">
            <div class="partial-delete-header">
                <span class="partial-delete-title">{language.partialEdit.deleteModalTitle}</span>
            </div>
            <p class="partial-delete-message">{language.partialEdit.deleteConfirmMessage}</p>
            <div class="partial-delete-preview">
                {deleteTargetElement?.textContent?.slice(0, 100)}{(deleteTargetElement?.textContent?.length ?? 0) > 100 ? '...' : ''}
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

<!-- 편집 모달 (편집 중일 때만 표시) -->
{#if isEditing}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="partial-edit-overlay" onclick={(e) => { if (e.target === e.currentTarget) handleCancel(); }}>
        <div class="partial-edit-modal">
            <div class="partial-edit-header">
                <span class="partial-edit-title">{language.partialEdit.editModalTitle}</span>
                <span class="partial-edit-hint">
                    {#if foundRange}
                        {language.partialEdit.matchFound(foundRange.method)}
                    {:else}
                        {language.partialEdit.matchNotFound}
                    {/if}
                </span>
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

    .partial-delete-modal {
        background: var(--risu-theme-bgcolor, #fff);
        border-radius: 12px;
        padding: 20px;
        min-width: 320px;
        max-width: 90vw;
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
        color: var(--risu-theme-textcolor2, #666);
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
        min-width: 400px;
        max-width: 90vw;
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

    .partial-edit-hint {
        font-size: 12px;
        color: var(--risu-theme-textcolor2, #666);
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
</style>
