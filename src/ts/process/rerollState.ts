import type { Chat, ChatRerollState, Message } from '../storage/database.svelte'
import { getRerolls } from './prereroll'

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Deep-clone a segment, stripping nested swipe metadata to avoid recursion. */
export function cloneSwipeSegment(segment: Message[]): Message[] {
    return safeStructuredClone(segment).map((m) => {
        delete m.swipes
        delete m.swipeId
        return m
    })
}

function cloneSwipeSegments(segments: Message[][]): Message[][] {
    return segments.map(cloneSwipeSegment)
}

function hasRerollContent(segment: Message[]): boolean {
    return segment.some((m) => m.data !== '')
}

/** Safely read the length of the active swipe segment on a message. */
function getActiveSwipeLength(message?: Message): number {
    const swipes = message?.swipes
    if (!Array.isArray(swipes) || swipes.length === 0) {
        return 0
    }
    const swipeId = Math.min(Math.max(message.swipeId ?? 0, 0), swipes.length - 1)
    const segment = swipes[swipeId]
    if (!Array.isArray(segment)) {
        return 0
    }
    return segment.length
}

/** Validate that a swipes array is well-formed (Review 6.1). */
function isValidSwipes(swipes: unknown): swipes is Message[][] {
    if (!Array.isArray(swipes)) return false
    return swipes.every(
        (seg) =>
            Array.isArray(seg) &&
            seg.length > 0 &&
            seg.every((m: unknown) => m != null && typeof (m as Message).data === 'string')
    )
}

// ---------------------------------------------------------------------------
// RerollManager — encapsulates all reroll state and persistence
// ---------------------------------------------------------------------------

export class RerollManager {
    private segments: Message[][] = []
    private segmentIndex = -1
    private startIndex = -1
    private importedGenIds = new Set<string>()
    private lastCharId = -1
    private lastChatPage = -1

    // -----------------------------------------------------------------------
    // Public read-only accessors
    // -----------------------------------------------------------------------

    get currentIndex(): number {
        return this.segmentIndex
    }

    get total(): number {
        return this.segments.length
    }

    /** Whether there are persisted swipes available for a given message index. */
    canDeleteReroll(idx: number, messages: Message[], isDoingChat: boolean): boolean {
        if (isDoingChat) return false
        const msg = messages[idx]
        if (!msg || msg.role !== 'char' || msg.isComment) return false

        // Check in-memory reroll state first
        const activeLen = this.segments[this.segmentIndex]?.length ?? 0
        if (
            this.startIndex >= 0 &&
            idx >= this.startIndex &&
            idx < this.startIndex + activeLen &&
            this.segments.length > 1
        ) {
            return true
        }

        // Check persisted swipes on the specific message (Review 2.2: O(1) not O(n))
        const si = this.findPersistedStartIndex(idx, messages)
        if (si < 0) return false
        const swipes = messages[si]?.swipes
        return isValidSwipes(swipes) && swipes.length > 1
    }

    /** Get the swipe counter info for a message index, if applicable. */
    getSwipeInfo(idx: number, messages: Message[]): { current: number; total: number } | null {
        // Check in-memory state
        if (this.containsIndex(idx) && this.segments.length > 1) {
            return { current: this.segmentIndex + 1, total: this.segments.length }
        }
        // Check persisted swipes
        const si = this.findPersistedStartIndex(idx, messages)
        if (si >= 0) {
            const msg = messages[si]
            if (isValidSwipes(msg?.swipes) && msg.swipes.length > 1) {
                const swipeId = Math.min(Math.max(msg.swipeId ?? 0, 0), msg.swipes.length - 1)
                return { current: swipeId + 1, total: msg.swipes.length }
            }
        }
        return null
    }

    // -----------------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------------

    reset(): void {
        this.segments = []
        this.segmentIndex = -1
        this.startIndex = -1
        this.importedGenIds = new Set()
    }

    /** Call when the active character or chat page may have changed. */
    resetIfSelectionChanged(charId: number, chatPage: number): void {
        if (this.lastCharId !== charId || this.lastChatPage !== chatPage) {
            this.reset()
            this.rememberSelection(charId, chatPage)
        }
    }

    rememberSelection(charId: number, chatPage: number): void {
        this.lastCharId = charId
        this.lastChatPage = chatPage
    }

    /** Call when a message is deleted so in-memory state doesn't reference stale indices (Review 3.3). */
    handleMessageDeletion(deletedIdx: number, messages: Message[], chat: Chat): void {
        if (this.segments.length === 0) return

        const activeLen = this.segments[this.segmentIndex]?.length ?? 0

        // If the deleted index falls within the active reroll range, reset
        if (this.startIndex >= 0 && deletedIdx >= this.startIndex && deletedIdx < this.startIndex + activeLen) {
            this.clearPersistedSwipes(messages, chat)
            this.reset()
            return
        }

        // If a message before the reroll was deleted, shift startIndex down
        if (this.startIndex > 0 && deletedIdx < this.startIndex) {
            this.startIndex -= 1
            this.persistSwipesOnMessages(messages, chat)
        }
    }

    // -----------------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------------

    /** Navigate to the next reroll variant. Returns true if navigation occurred. */
    navigateNext(idx: number, messages: Message[], chat: Chat): boolean {
        this.ensureLoaded(idx, messages, chat)
        this.importGeneratedRerolls(messages, chat)

        if (this.segmentIndex < this.segments.length - 1 && Array.isArray(this.segments[this.segmentIndex + 1])) {
            this.segmentIndex += 1
            this.applySegment(messages, chat)
            return true
        }
        return false
    }

    /** Navigate to the previous reroll variant. Returns true if navigation occurred. */
    navigatePrev(idx: number, messages: Message[], chat: Chat): boolean {
        this.ensureLoaded(idx, messages, chat)
        this.importGeneratedRerolls(messages, chat)

        if (this.segmentIndex > 0 && Array.isArray(this.segments[this.segmentIndex - 1])) {
            this.segmentIndex -= 1
            this.applySegment(messages, chat)
            return true
        }
        return false
    }

    /** Delete the currently selected reroll variant. */
    deleteVariant(idx: number, messages: Message[], chat: Chat): void {
        this.ensureLoaded(idx, messages, chat)
        this.importGeneratedRerolls(messages, chat)

        if (this.segments.length <= 1) return

        this.segments.splice(this.segmentIndex, 1)
        this.segmentIndex = Math.min(this.segmentIndex, this.segments.length - 1)
        this.applySegment(messages, chat)

        if (this.segments.length <= 1) {
            this.clearPersistedSwipes(chat.message, chat)
        }
    }

    // -----------------------------------------------------------------------
    // Registration (called after a generation completes)
    // -----------------------------------------------------------------------

    /**
     * Register a new reroll segment from messages added after `previousLength`.
     * Returns true if a segment was registered.
     */
    registerSegment(previousLength: number, messages: Message[], chat: Chat, requireContent = false): boolean {
        if (previousLength >= messages.length) return false

        const newSegment = messages.slice(previousLength)
        if (requireContent && !hasRerollContent(newSegment)) return false

        if (this.startIndex >= 0 && this.startIndex !== previousLength) {
            this.reset()
        }
        if (this.startIndex < 0 || this.segments.length === 0) {
            this.startIndex = previousLength
        }

        this.segments.push(cloneSwipeSegment(newSegment))
        this.segmentIndex = this.segments.length - 1
        this.importGeneratedRerolls(messages, chat)
        this.persistSwipesOnMessages(messages, chat)
        return true
    }

    /**
     * Save the current messages as the initial reroll segment before a new generation.
     * Also persists transient state on the chat for crash recovery.
     */
    saveBeforeGeneration(removedMessages: Message[], messageLength: number, chat: Chat): void {
        this.startIndex = messageLength
        if (this.segments.length === 0) {
            this.segments.push(cloneSwipeSegment(removedMessages))
            this.segmentIndex = this.segments.length - 1
        }
        this.persistTransientState(chat)
    }

    /**
     * Handle a failed generation: restore messages and clean up transient state.
     */
    handleFailedGeneration(savedMessages: Message[], chat: Chat): void {
        chat.message = savedMessages
        if (this.segments.length > 1) {
            this.persistSwipesOnMessages(savedMessages, chat)
        } else {
            this.clearTransientState(chat)
        }
    }

    // -----------------------------------------------------------------------
    // Edit-through: update reroll data when message text is edited
    // -----------------------------------------------------------------------

    updateMessageData(idx: number, data: string, messages: Message[], chat: Chat): void {
        this.ensureLoaded(idx, messages, chat)

        const segment = this.segments[this.segmentIndex]
        if (!Array.isArray(segment)) return

        const rerollMsgIdx = idx - this.startIndex
        if (rerollMsgIdx < 0 || rerollMsgIdx >= segment.length) return

        segment[rerollMsgIdx].data = data
        this.persistSwipesOnMessages(messages, chat)
    }

    // -----------------------------------------------------------------------
    // Loading persisted state
    // -----------------------------------------------------------------------

    /**
     * Load reroll state on component mount / chat switch.
     * Tries transient state first, then scans message.swipes.
     */
    loadPersisted(messages: Message[], chat: Chat): void {
        if (this.segments.length > 0) return

        if (this.loadTransientState(messages, chat)) return

        // Scan from the end for the last message with swipes
        for (let i = messages.length - 1; i >= 0; i--) {
            const msg = messages[i]
            if (!isValidSwipes(msg?.swipes) || msg.swipes.length === 0) continue

            const activeLen = getActiveSwipeLength(msg)
            if (activeLen === 0 || activeLen !== messages.length - i) continue

            this.startIndex = i
            this.segments = cloneSwipeSegments(msg.swipes)
            this.segmentIndex = Math.min(Math.max(msg.swipeId ?? 0, 0), this.segments.length - 1)
            this.segments[this.segmentIndex] = cloneSwipeSegment(messages.slice(i))
            this.markGenIdImported(this.segments[this.segmentIndex])
            this.persistSwipesOnMessages(messages, chat)
            return
        }
    }

    /** Clear transient reroll state from chat (used when sending new user messages). */
    clearTransient(chat: Chat): void {
        this.clearTransientState(chat)
    }

    // -----------------------------------------------------------------------
    // Internal persistence helpers
    // -----------------------------------------------------------------------

    /** Write swipe data onto the message at startIndex (long-term persistence). */
    private persistSwipesOnMessages(messages: Message[], chat: Chat): void {
        if (this.startIndex < 0 || this.segmentIndex < 0 || this.segments.length <= 1) return

        const msg = messages[this.startIndex]
        if (!msg) return

        msg.swipes = cloneSwipeSegments(this.segments)
        msg.swipeId = this.segmentIndex
        this.clearTransientState(chat)
    }

    /** Clear swipe data from the message at startIndex. */
    private clearPersistedSwipes(messages: Message[], chat: Chat): void {
        if (this.startIndex >= 0) {
            const msg = messages[this.startIndex]
            if (msg) {
                delete msg.swipes
                delete msg.swipeId
            }
        }
        this.clearTransientState(chat)
    }

    /** Write transient reroll snapshot to the Chat object (for crash recovery during generation). */
    private persistTransientState(chat: Chat): void {
        if (this.startIndex < 0 || this.segmentIndex < 0 || this.segments.length === 0) {
            delete chat.rerollState
            return
        }
        chat.rerollState = {
            segments: cloneSwipeSegments(this.segments),
            index: Math.min(Math.max(this.segmentIndex, 0), this.segments.length - 1),
            startIndex: this.startIndex,
        }
    }

    private clearTransientState(chat: Chat): void {
        delete chat.rerollState
    }

    /** Restore from transient state (chat.rerollState). Returns true if loaded (Review 2.1: no misleading param reassign). */
    private loadTransientState(messages: Message[], chat: Chat): boolean {
        const state = chat.rerollState
        if (!state || !Array.isArray(state.segments) || state.segments.length === 0) return false
        // Validate segments (Review 6.1)
        if (!state.segments.every((seg: unknown) => Array.isArray(seg) && (seg as Message[]).length > 0)) return false

        const si = Math.max(0, state.startIndex)
        const idx = Math.min(Math.max(state.index ?? 0, 0), state.segments.length - 1)
        this.startIndex = si
        this.segments = cloneSwipeSegments(state.segments)
        this.segmentIndex = idx

        const visibleTail = messages.slice(si)
        if (visibleTail.length > 0 && hasRerollContent(visibleTail)) {
            this.segments[this.segmentIndex] = cloneSwipeSegment(visibleTail)
        } else {
            const active = this.segments[this.segmentIndex]
            if (Array.isArray(active) && active.length > 0) {
                const restored = [...messages.slice(0, si), ...cloneSwipeSegment(active)]
                chat.message = restored
            }
        }

        this.markGenIdImported(this.segments[this.segmentIndex])

        if (this.segments.length > 1) {
            this.persistSwipesOnMessages(chat.message, chat)
        } else {
            this.clearTransientState(chat)
        }
        return true
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    private containsIndex(idx: number): boolean {
        const len = this.segments[this.segmentIndex]?.length ?? 0
        return this.startIndex >= 0 && idx >= this.startIndex && idx < this.startIndex + len
    }

    /** Ensure reroll data is loaded for the given message index. */
    private ensureLoaded(idx: number, messages: Message[], chat: Chat): void {
        if (idx >= 0 && !this.containsIndex(idx)) {
            if (!this.loadPersistedAtIndex(idx, messages)) {
                this.reset()
            }
        } else {
            this.loadPersisted(messages, chat)
        }
    }

    /** Load persisted swipes from the message that covers `idx`. */
    private loadPersistedAtIndex(idx: number, messages: Message[]): boolean {
        const si = this.findPersistedStartIndex(idx, messages)
        if (si < 0) return false

        const msg = messages[si]
        if (!isValidSwipes(msg?.swipes) || msg.swipes.length === 0) return false

        const swipeId = Math.min(Math.max(msg.swipeId ?? 0, 0), msg.swipes.length - 1)
        const activeLen = msg.swipes[swipeId]?.length ?? 0
        if (activeLen === 0) return false

        this.startIndex = si
        this.segments = cloneSwipeSegments(msg.swipes)
        this.segmentIndex = swipeId
        this.segments[this.segmentIndex] = cloneSwipeSegment(messages.slice(si, si + activeLen))
        this.markGenIdImported(this.segments[this.segmentIndex])
        return true
    }

    /** Find the message index that has swipes covering `idx`. */
    private findPersistedStartIndex(idx: number, messages: Message[]): number {
        for (let i = Math.min(idx, messages.length - 1); i >= 0; i--) {
            const activeLen = getActiveSwipeLength(messages[i])
            if (activeLen > 0 && i <= idx && idx < i + activeLen) {
                return i
            }
        }
        return -1
    }

    private markGenIdImported(segment?: Message[]): void {
        const genId = segment?.[0]?.generationInfo?.generationId
        if (genId) this.importedGenIds.add(genId)
    }

    /**
     * Apply the current segment to the message array (Review 2.6: use segment length, not stale swipe length).
     */
    private applySegment(messages: Message[], chat: Chat): void {
        const segment = this.segments[this.segmentIndex]
        if (!Array.isArray(segment) || segment.length === 0) return

        const si = this.startIndex >= 0 ? this.startIndex : Math.max(0, messages.length - segment.length)
        const cloned = cloneSwipeSegment(segment)

        // Determine how many messages to replace: use the persisted swipe length at si,
        // falling back to the new segment length. This prevents stale data issues.
        const currentActiveLen = getActiveSwipeLength(messages[si])
        const tailStart = currentActiveLen > 0 ? si + currentActiveLen : si + segment.length

        const next = [...messages.slice(0, si), ...cloned, ...messages.slice(tailStart)]
        chat.message = next
        this.persistSwipesOnMessages(next, chat)
    }

    /** Import generated reroll alternatives from the prereroll cache (Review 2.4: clone once). */
    private importGeneratedRerolls(messages: Message[], chat: Chat): void {
        const currentSeg = this.segments[this.segmentIndex]
        const activeMsg = Array.isArray(currentSeg) && currentSeg.length === 1 ? currentSeg[0] : messages.at(-1)
        const genId = activeMsg?.generationInfo?.generationId
        const cached = genId ? getRerolls(genId) : null

        if (!activeMsg || !genId || !cached || cached.length <= 1 || this.importedGenIds.has(genId)) {
            return
        }

        if (this.startIndex < 0) {
            this.startIndex = Math.max(0, messages.length - 1)
        }

        // Clone baseMessage once, then spread for each variant (Review 2.4)
        const baseMessage = cloneSwipeSegment([activeMsg])[0]
        const generatedRerolls = [activeMsg.data, ...cached.slice(1)].map((data) => [
            { ...safeStructuredClone(baseMessage), data },
        ])

        const replaceIdx = this.segmentIndex >= 0 ? this.segmentIndex : this.segments.length
        if (this.segmentIndex < 0) {
            this.segments.push(...generatedRerolls)
            this.segmentIndex = 0
        } else {
            this.segments.splice(replaceIdx, 1, ...generatedRerolls)
            this.segmentIndex = replaceIdx
        }
        this.importedGenIds.add(genId)
        this.persistSwipesOnMessages(messages, chat)
    }
}
