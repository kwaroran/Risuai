import { describe, expect, it } from 'vitest'
import { moveMessageAction, normalizeMessageActions, placeMessageActions, type MessageActionSetting } from './messageActions'

describe('placeMessageActions', () => {
    it('keeps the existing wide layout by default', () => {
        const { toolbar, menu } = placeMessageActions({ narrow: false, editing: false })
        expect(toolbar).toEqual(['translate', 'edit', 'copy', 'tts', 'remove'])
        expect(menu).toEqual(['bookmark', 'branch', 'disable', 'cut'])
    })

    it('keeps the existing narrow layout by default', () => {
        const { toolbar, menu } = placeMessageActions({ narrow: true, editing: false })
        expect(toolbar).toEqual(['translate', 'edit'])
        expect(menu).toEqual(['copy', 'tts', 'remove', 'bookmark', 'branch', 'disable', 'cut'])
    })

    it('moves wide-only actions into the menu on narrow screens', () => {
        const saved: MessageActionSetting[] = [
            { id: 'translate', place: 'hidden' },
            { id: 'copy', place: 'always' },
            { id: 'edit', place: 'wide' },
            { id: 'remove', place: 'wide' },
        ]
        const { toolbar, menu, hidden } = placeMessageActions({ saved, narrow: true, editing: false })
        expect(toolbar).toEqual(['copy'])
        expect(menu.slice(0, 2)).toEqual(['edit', 'remove'])
        expect(hidden).toEqual(['translate'])
    })

    it('shows the edit button while editing', () => {
        const fromMenu = placeMessageActions({ saved: [{ id: 'edit', place: 'menu' }], narrow: false, editing: true })
        expect(fromMenu.toolbar[0]).toBe('edit')
        expect(fromMenu.menu).not.toContain('edit')

        const fromHidden = placeMessageActions({ saved: [{ id: 'edit', place: 'hidden' }], narrow: false, editing: true })
        expect(fromHidden.toolbar[0]).toBe('edit')
        expect(fromHidden.hidden).not.toContain('edit')

        const narrowWide = placeMessageActions({ saved: [{ id: 'edit', place: 'wide' }], narrow: true, editing: true })
        expect(narrowWide.toolbar[0]).toBe('edit')
        expect(narrowWide.menu).not.toContain('edit')
    })
})

describe('moveMessageAction', () => {
    const actions: MessageActionSetting[] = [
        { id: 'translate', place: 'always' },
        { id: 'edit', place: 'always' },
        { id: 'cut', place: 'menu' },
    ]

    it('inserts before the target, across groups', () => {
        expect(moveMessageAction(actions, 'cut', 'always', 'edit')).toEqual([
            { id: 'translate', place: 'always' },
            { id: 'cut', place: 'always' },
            { id: 'edit', place: 'always' },
        ])
    })

    it('reorders inside a group', () => {
        expect(moveMessageAction(actions, 'edit', 'always', 'translate').map((v) => v.id)).toEqual(['edit', 'translate', 'cut'])
    })

    it('puts the action at the end without a target', () => {
        expect(moveMessageAction(actions, 'translate', 'hidden').at(-1)).toEqual({ id: 'translate', place: 'hidden' })
    })
})

describe('normalizeMessageActions', () => {
    it('drops unknown and duplicate entries and restores missing ones', () => {
        const saved = [
            { id: 'cut', place: 'hidden' },
            { id: 'cut', place: 'always' },
            { id: 'removedLater', place: 'menu' },
            { id: 'edit', place: 'toolbar' },
        ] as unknown as MessageActionSetting[]
        const result = normalizeMessageActions(saved)
        expect(result[0]).toEqual({ id: 'cut', place: 'hidden' })
        expect(result.find((v) => v.id === 'edit')?.place).toBe('always')
        expect(result).toHaveLength(9)
        expect(new Set(result.map((v) => v.id)).size).toBe(9)
    })
})
