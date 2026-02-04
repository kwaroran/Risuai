<script lang="ts">
    import { CheckIcon, XIcon } from '@lucide/svelte';
    import { createEventDispatcher, onDestroy } from 'svelte';
    import { DBState } from 'src/ts/stores.svelte';
    import { language } from 'src/lang';
    import { 
        findOriginalRangeFromHtml, 
        findAllOriginalRangesFromHtml,
        htmlToPlain,
        replaceRange,
        EDITABLE_BLOCK_SELECTORS,
        type RangeResult,
        type RangeResultWithContext
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
    let editText = $state('');
    let textareaRef: HTMLTextAreaElement | null = $state(null);

    // 삭제 확인 상태
    let isConfirmingDelete = $state(false);

    // 통합 매칭 상태
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

    // 매칭 실패 모달 상태
    let showMatchFailedModal = $state(false);

    const SELECTOR = EDITABLE_BLOCK_SELECTORS.join(', ');

    // DOM에 직접 추가할 버튼 요소
    let buttonWrapper: HTMLDivElement | null = null;
    let currentHoveredBlock: HTMLElement | null = null;

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

    // 매칭 찾기 및 처리 헬퍼 함수
    function findAndProcessMatches(
        mode: MatchingMode,
        element: HTMLElement,
        proceedCallback: (match: RangeResultWithContext) => void
    ) {
        if (!element || !messageData) return;

        matchingState.mode = mode;
        matchingState.targetElement = element;
        matchingState.originalHTML = element.innerHTML;

        // 매칭 옵션 설정
        const options = mode === 'edit' 
            ? { extendToEOL: false, snapStartToPrevEOL: false }
            : { extendToEOL: true, snapStartToPrevEOL: true };

        // 모든 매칭 결과 찾기
        matchingState.foundMatches = findAllOriginalRangesFromHtml(messageData, element, options);

        if (matchingState.foundMatches.length === 0) {
            // 매칭 실패
            showMatchFailedModal = true;
            return;
        }

        // confidence >= 0.95인 결과 필터링
        const highConfidenceMatches = matchingState.foundMatches.filter(m => m.confidence >= 0.95);

        if (highConfidenceMatches.length === 1) {
            // 높은 confidence가 하나만 있으면 바로 진행
            proceedCallback(highConfidenceMatches[0]);
        } else if (matchingState.foundMatches.length === 1) {
            // 전체 결과가 하나면 바로 진행
            proceedCallback(matchingState.foundMatches[0]);
        } else {
            // 여러 결과가 있으면 선택 모달 표시 (mode는 이미 설정됨)
        }

        hideButton();
    }

    // 편집 시작
    function startEdit() {
        if (!currentHoveredBlock) return;
        findAndProcessMatches('edit', currentHoveredBlock, proceedWithEdit);
    }

    // 선택된 매칭으로 편집 진행
    function proceedWithEdit(match: RangeResultWithContext) {
        matchingState.selectedRange = match;
        matchingState.mode = null; // 선택 모달 닫기
        editText = messageData.slice(match.start, match.end);
        isEditing = true;

        // 다음 틱에 textarea 포커스
        setTimeout(() => {
            if (textareaRef) {
                textareaRef.focus();
                textareaRef.select();
                adjustHeight();
            }
        }, 10);
    }

    // 매칭 선택
    function selectMatchAtIndex(index: number) {
        const match = matchingState.foundMatches[index];
        if (!match) return;

        if (matchingState.mode === 'edit') {
            proceedWithEdit(match);
        } else if (matchingState.mode === 'delete') {
            proceedWithDelete(match);
        }
    }

    // 매칭 선택 취소
    function cancelMatchSelection() {
        // 편집 모드일 때만 HTML 복원
        if (matchingState.mode === 'edit' && matchingState.targetElement && matchingState.originalHTML) {
            matchingState.targetElement.innerHTML = matchingState.originalHTML;
        }

        matchingState = {
            mode: null,
            targetElement: null,
            originalHTML: '',
            foundMatches: [],
            selectedRange: null,
        };
    }

    // 저장
    function handleSave() {
        if (!matchingState.selectedRange) return;

        const newData = replaceRange(messageData, matchingState.selectedRange, editText);
        dispatch('save', { newData });

        // 편집 종료
        closeEdit();
    }

    // 취소
    function handleCancel() {
        if (matchingState.targetElement && matchingState.originalHTML) {
            matchingState.targetElement.innerHTML = matchingState.originalHTML;
        }
        closeEdit();
    }

    // 편집 종료
    function closeEdit() {
        isEditing = false;
        editText = '';
        matchingState = {
            mode: null,
            targetElement: null,
            originalHTML: '',
            foundMatches: [],
            selectedRange: null,
        };
    }

    // 삭제 시작
    function startDelete() {
        if (!currentHoveredBlock) return;
        findAndProcessMatches('delete', currentHoveredBlock, proceedWithDelete);
    }

    // 선택된 매칭으로 삭제 진행
    function proceedWithDelete(match: RangeResultWithContext) {
        matchingState.selectedRange = match;
        matchingState.mode = null; // 선택 모달 닫기
        isConfirmingDelete = true;
    }

    // 삭제 확인
    function handleConfirmDelete() {
        if (!matchingState.selectedRange) return;

        let newData = replaceRange(messageData, matchingState.selectedRange, '');

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
        matchingState = {
            mode: null,
            targetElement: null,
            originalHTML: '',
            foundMatches: [],
            selectedRange: null,
        };
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

<!-- 매칭 실패 모달 -->
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

<!-- 삭제 확인 모달 -->
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

<!-- 매칭 선택 모달 (편집/삭제 공통) -->
{#if matchingState.mode === 'edit'}
    {@render MatchSelectionModal('edit', matchingState.foundMatches, language.partialEdit.selectMatch)}
{:else if matchingState.mode === 'delete'}
    {@render MatchSelectionModal('delete', matchingState.foundMatches, language.partialEdit.selectDeleteMatch)}
{/if}

<!-- 편집 모달 (편집 중일 때만 표시) -->
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
        width: min(calc(100% - 2rem), 500px);
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
        width: min(calc(100% - 2rem), 1600px);
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
        width: min(calc(100% - 2rem), 1600px);
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
        width: min(calc(100% - 2rem), 1200px);
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
