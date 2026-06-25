// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, tick, unmount } from 'svelte'
import CheckInput from './CheckInput.svelte'
import SegmentedControl from './SegmentedControl.svelte'
import TextInput from './TextInput.svelte'

const mountedComponents: unknown[] = []

function renderGui(component: Parameters<typeof mount>[0], props: Record<string, unknown>) {
    const target = document.createElement('div')
    document.body.appendChild(target)

    const mounted = mount(component, {
        target,
        props,
    })

    mountedComponents.push(mounted)

    return {
        target,
        mounted,
    }
}

afterEach(async () => {
    const components = mountedComponents.splice(0)
    await Promise.all(components.map((component) => unmount(component as never)))
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

describe('GUI rendering without a browser session', () => {
    it('mounts a text input and wires DOM input events', async () => {
        const oninput = vi.fn()

        const { target } = renderGui(TextInput, {
            id: 'gui-render-text',
            value: 'initial value',
            placeholder: 'Type here',
            fullwidth: true,
            oninput,
        })

        const input = target.querySelector<HTMLInputElement>('input#gui-render-text')
        expect(input).not.toBeNull()
        expect(input?.value).toBe('initial value')
        expect(input?.placeholder).toBe('Type here')
        expect(input?.classList.contains('w-full')).toBe(true)

        input!.value = 'changed value'
        input!.dispatchEvent(new Event('input', { bubbles: true }))
        await tick()

        expect(oninput).toHaveBeenCalledTimes(1)
        expect(input?.value).toBe('changed value')
    })

    it('mounts a checkbox and reflects checked state in the rendered DOM', async () => {
        const onChange = vi.fn()

        const { target } = renderGui(CheckInput, {
            check: false,
            name: 'Render checkbox',
            onChange,
        })

        const label = target.querySelector('label')
        const checkbox = target.querySelector<HTMLInputElement>('input[type="checkbox"]')
        expect(label?.textContent).toContain('Render checkbox')
        expect(checkbox).not.toBeNull()
        expect(checkbox?.checked).toBe(false)
        expect(target.querySelector('svg')).toBeNull()

        checkbox!.click()
        await tick()

        expect(onChange).toHaveBeenCalledWith(true)
        expect(checkbox?.checked).toBe(true)
        expect(target.querySelector('svg')).not.toBeNull()
    })

    it('mounts a segmented control and updates the active segment after click', async () => {
        const { target } = renderGui(SegmentedControl, {
            value: 'list',
            options: [
                { value: 'list', label: 'List' },
                { value: 'card', label: 'Card' },
                { value: 'grid', label: 'Grid' },
            ],
        })

        const buttons = Array.from(target.querySelectorAll<HTMLButtonElement>('[data-segment-btn]'))
        expect(buttons.map((button) => button.textContent?.trim())).toEqual(['List', 'Card', 'Grid'])
        expect(buttons[0].classList.contains('segmented-btn-active')).toBe(true)
        expect(target.querySelector('.segmented-indicator')).not.toBeNull()

        buttons[2].click()
        await tick()

        expect(buttons[0].classList.contains('segmented-btn-active')).toBe(false)
        expect(buttons[2].classList.contains('segmented-btn-active')).toBe(true)
    })
})
