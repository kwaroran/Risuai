import { get } from 'svelte/store'
import { DBState, selectedCharID } from '../stores.svelte'
import { parseKeyValue } from '../util'

export function getChatVar(key:string): string {
    const selectedChar = get(selectedCharID)
    const char = DBState.db.characters[selectedChar]
    if(!char){
        return 'null'
    }
    const chat = char.chats[char.chatPage]
    chat.scriptstate ??= {}
    const state = (chat.scriptstate['$' + key])
    if(state === undefined || state === null){
        const defaultVariables = parseKeyValue(char.defaultVariables).concat(parseKeyValue(DBState.db.templateDefaultVariables))
        const findResult = defaultVariables.find((f) => {
            return f[0] === key
        })
        if(findResult){
            return findResult[1]
        }
        return 'null'
    }
    return state.toString()
}

export function setChatVar(key:string, value:string): void {
    const selectedChar = get(selectedCharID)
    if(!DBState.db.characters[selectedChar].chats[DBState.db.characters[selectedChar].chatPage].scriptstate){
        DBState.db.characters[selectedChar].chats[DBState.db.characters[selectedChar].chatPage].scriptstate = {}
    }
    DBState.db.characters[selectedChar].chats[DBState.db.characters[selectedChar].chatPage].scriptstate['$' + key] = value
}

/**
 * Retrieves a global variable ("toggle value") by its key.
 * 
 * @param key The key. Must start with `'toggle_'`, or it will be prepended automatically.
 */
export function getGlobalChatVar(key: string): string {
    const key_ = key.startsWith('toggle_') ? key : `toggle_${key}`
    return DBState.db.globalChatVariables[key_] ?? 'null'
}
