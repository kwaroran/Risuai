import { untrack } from "svelte"
import type { toSaveType } from "./risuSave"

/**
 * Registers the effects that mark the root settings and the selected character dirty for saveDb.
 * Must be called inside an effect root.
 *
 * The parts are tracked by separate effects, so that a streaming update of the current chat
 * only re-runs the current chat effect (d):
 * (a) root-level keys
 * (b) the selected character, except its chats (and reloadKeys, which is bumped on every streaming chunk)
 * (c) the chats array of the selected character and every chat except the current one: marks all chats dirty
 * (d) the current chat and reloadKeys: marks only the current chat dirty
 * Every effect marks the selected character dirty and calls onChange, as the single effect did before.
 */
/**
 * Own string keys of a $state proxy. Unlike for...in / Object.keys, this does not read the value
 * signal of every key (the proxy's getOwnPropertyDescriptor trap does), so only key additions and
 * removals are tracked.
 */
function ownKeys(obj: any): string[] {
    if (!obj || typeof obj !== 'object') {
        return []
    }
    return Reflect.ownKeys(obj).filter((key): key is string => typeof key === 'string')
}

export function registerSaveChangeTracking(arg: {
    tracker: toSaveType
    getDb: () => any
    getSelectedIndex: () => number
    onChange: () => void
}) {
    const { tracker, getDb, getSelectedIndex, onChange } = arg
    tracker.allChats ??= []

    function markCharacterDirty(chaId: string) {
        if (tracker.character[0] !== chaId) {
            tracker.character.unshift(chaId)
        }
    }
    function markChatDirty(chaId: string, chatId: string) {
        if (tracker.chat[0]?.[0] !== chaId || tracker.chat[0]?.[1] !== chatId) {
            tracker.chat.unshift([chaId, chatId])
        }
    }
    function markAllChatsDirty(chaId: string) {
        if (!tracker.allChats.includes(chaId)) {
            tracker.allChats.push(chaId)
        }
    }

    // (a) root-level keys
    $effect(() => {
        const db = getDb()
        for (const key of ownKeys(db)) {
            if (
                key !== 'characters' && key !== 'botPresets' && key !== 'modules' &&
                key !== 'loadouts' && key !== 'plugins' && key !== 'pluginCustomStorage'
            ) {
                $state.snapshot(db[key])
            }
        }
        untrack(() => {
            const character = getDb()?.characters?.[getSelectedIndex()]
            if (character) {
                markCharacterDirty(character.chaId)
            }
        })
        onChange()
    })
    // (b) selected character, everything except its chats and reloadKeys
    $effect(() => {
        const character = getDb()?.characters?.[getSelectedIndex()]
        if (!character) {
            return
        }
        for (const key of ownKeys(character)) {
            if (key !== 'chats' && key !== 'reloadKeys') {
                $state.snapshot(character[key])
            }
        }
        untrack(() => {
            markCharacterDirty(character.chaId)
        })
        onChange()
    })
    // (c) the chats array of the selected character and every chat except the current one
    $effect(() => {
        const character = getDb()?.characters?.[getSelectedIndex()]
        if (!character) {
            return
        }
        const chats = character.chats
        const chatPage = character.chatPage
        if (Array.isArray(chats)) {
            const length = chats.length
            for (let i = 0; i < length; i++) {
                if (i !== chatPage) {
                    $state.snapshot(chats[i])
                }
            }
        }
        else {
            $state.snapshot(chats)
        }
        untrack(() => {
            markCharacterDirty(character.chaId)
            markAllChatsDirty(character.chaId)
        })
        onChange()
    })
    // (d) the current chat
    $effect(() => {
        const character = getDb()?.characters?.[getSelectedIndex()]
        if (!character) {
            return
        }
        character.reloadKeys
        const currentChat = character.chats?.[character.chatPage]
        $state.snapshot(currentChat)
        untrack(() => {
            markCharacterDirty(character.chaId)
            if (currentChat) {
                markChatDirty(character.chaId, currentChat.id)
            }
        })
        onChange()
    })
}
