export type MessageActionId = 'translate' | 'edit' | 'copy' | 'tts' | 'remove' | 'bookmark' | 'branch' | 'disable' | 'cut'
export type MessageActionPlace = 'always' | 'wide' | 'menu' | 'hidden'

export interface MessageActionSetting {
    id: MessageActionId
    place: MessageActionPlace
}

export const messageActionPlaces: readonly MessageActionPlace[] = ['always', 'wide', 'menu', 'hidden']

export const defaultMessageActions: readonly MessageActionSetting[] = [
    { id: 'translate', place: 'always' },
    { id: 'edit', place: 'always' },
    { id: 'copy', place: 'wide' },
    { id: 'tts', place: 'wide' },
    { id: 'remove', place: 'wide' },
    { id: 'bookmark', place: 'menu' },
    { id: 'branch', place: 'menu' },
    { id: 'disable', place: 'menu' },
    { id: 'cut', place: 'menu' },
]

// Unknown or duplicate entries are dropped; actions added after the setting was saved get their default place.
export function normalizeMessageActions(saved?: MessageActionSetting[] | null): MessageActionSetting[] {
    const actions = new Map<MessageActionId, MessageActionSetting>()
    for (const action of saved ?? []) {
        const known = defaultMessageActions.some((v) => v.id === action.id) && messageActionPlaces.includes(action.place)
        if (known && !actions.has(action.id)) {
            actions.set(action.id, { ...action })
        }
    }
    for (const action of defaultMessageActions) {
        if (!actions.has(action.id)) {
            actions.set(action.id, { ...action })
        }
    }
    return [...actions.values()]
}

export function moveMessageAction(
    actions: MessageActionSetting[],
    id: MessageActionId,
    place: MessageActionPlace,
    beforeId?: MessageActionId,
): MessageActionSetting[] {
    const rest = actions.filter((v) => v.id !== id)
    const index = beforeId ? rest.findIndex((v) => v.id === beforeId) : rest.length
    rest.splice(index, 0, { id, place })
    return rest
}

export function placeMessageActions(arg: {
    saved?: MessageActionSetting[] | null
    narrow: boolean
    editing: boolean
}) {
    const actions = normalizeMessageActions(arg.saved)
    const idsIn = (place: MessageActionPlace) => actions.filter((v) => v.place === place).map((v) => v.id)

    let toolbar = arg.narrow ? idsIn('always') : [...idsIn('always'), ...idsIn('wide')]
    let menu = arg.narrow ? [...idsIn('wide'), ...idsIn('menu')] : idsIn('menu')
    let hidden = idsIn('hidden')

    // Finishing an edit needs the edit button, wherever the user put it.
    if (arg.editing && !toolbar.includes('edit')) {
        menu = menu.filter((v) => v !== 'edit')
        hidden = hidden.filter((v) => v !== 'edit')
        toolbar = ['edit', ...toolbar]
    }

    return { toolbar, menu, hidden }
}
