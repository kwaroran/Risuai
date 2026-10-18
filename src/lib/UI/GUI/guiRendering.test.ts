// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import Button from './Button.svelte'
import CheckInput from './CheckInput.svelte'
import IconButton from './IconButton.svelte'
import NumberInput from './NumberInput.svelte'
import OptionInput from './OptionInput.svelte'
import OptionalInput from './OptionalInput.svelte'
import SegmentedControl from './SegmentedControl.svelte'
import SelectInput from './SelectInput.svelte'
import SliderInput from './SliderInput.svelte'
import TextInput from './TextInput.svelte'

type GuiComponent = Parameters<typeof mount>[0]
type GuiProps = Record<string, unknown>

const mountedComponents: unknown[] = []

function htmlSnippet(html: string) {
    return createRawSnippet(() => ({
        render: () => html,
    }))
}

function renderGui(component: GuiComponent, props: GuiProps = {}) {
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
        getBySelector<T extends Element = Element>(selector: string) {
            const element = target.querySelector<T>(selector)
            expect(element, `Expected ${selector} to be rendered`).not.toBeNull()
            return element as T
        },
    }
}

async function inputValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    element.value = value
    element.dispatchEvent(new Event('input', { bubbles: true }))
    await tick()
}

async function changeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
    element.value = value
    element.dispatchEvent(new Event('change', { bubbles: true }))
    await tick()
}

afterEach(async () => {
    const components = mountedComponents.splice(0)
    await Promise.all(components.map((component) => unmount(component as never)))
    document.body.replaceChildren()
    vi.restoreAllMocks()
})

describe('GUI rendering without a browser session', () => {
    it('renders button primitives with snippet content, variants, and disabled behavior', async () => {
        const onPrimaryClick = vi.fn()
        const onDisabledClick = vi.fn()
        const onIconClick = vi.fn()

        const primary = renderGui(Button, {
            children: htmlSnippet('<span>Save</span>'),
            onclick: onPrimaryClick,
            selected: true,
            size: 'lg',
        })
        const disabled = renderGui(Button, {
            children: htmlSnippet('<span>Delete</span>'),
            onclick: onDisabledClick,
            disabled: true,
            styled: 'danger',
        })
        const icon = renderGui(IconButton, {
            children: htmlSnippet('<span aria-hidden="true">i</span>'),
            onclick: onIconClick,
            name: 'Details',
            id: 'gui-render-icon-button',
        })

        const primaryButton = primary.getBySelector<HTMLButtonElement>('button')
        const disabledButton = disabled.getBySelector<HTMLButtonElement>('button')
        const iconButton = icon.getBySelector<HTMLButtonElement>('button#gui-render-icon-button')

        expect(primaryButton.textContent?.trim()).toBe('Save')
        expect(primaryButton.classList.contains('px-6')).toBe(true)
        expect(primaryButton.classList.contains('bg-bg-selected')).toBe(true)

        expect(disabledButton.textContent?.trim()).toBe('Delete')
        expect(disabledButton.disabled).toBe(true)
        expect(disabledButton.classList.contains('opacity-50')).toBe(true)

        expect(iconButton.textContent?.replace(/\s+/g, ' ').trim()).toBe('i Details')

        primaryButton.click()
        disabledButton.click()
        iconButton.click()
        await tick()

        expect(onPrimaryClick).toHaveBeenCalledTimes(1)
        expect(onDisabledClick).not.toHaveBeenCalled()
        expect(onIconClick).toHaveBeenCalledTimes(1)
    })

    it('renders text, password, and number inputs with values, attributes, and callbacks', async () => {
        const onTextInput = vi.fn()
        const onNumberChange = vi.fn()

        const text = renderGui(TextInput, {
            id: 'gui-render-text',
            value: 'initial value',
            placeholder: 'Type here',
            fullwidth: true,
            oninput: onTextInput,
        })
        const password = renderGui(TextInput, {
            id: 'gui-render-secret',
            value: 'secret',
            hideText: true,
            disabled: true,
        })
        const number = renderGui(NumberInput, {
            id: 'gui-render-number',
            value: 3,
            min: 1,
            max: 10,
            placeholder: 'Amount',
            onChange: onNumberChange,
        })

        const textInput = text.getBySelector<HTMLInputElement>('input#gui-render-text')
        const passwordInput = password.getBySelector<HTMLInputElement>('input#gui-render-secret')
        const numberInput = number.getBySelector<HTMLInputElement>('input#gui-render-number')

        expect(textInput.value).toBe('initial value')
        expect(textInput.placeholder).toBe('Type here')
        expect(textInput.classList.contains('w-full')).toBe(true)

        expect(passwordInput.type).toBe('password')
        expect(passwordInput.disabled).toBe(true)
        expect(passwordInput.autocomplete).toBe('new-password')

        expect(numberInput.type).toBe('number')
        expect(numberInput.min).toBe('1')
        expect(numberInput.max).toBe('10')
        expect(numberInput.value).toBe('3')

        await inputValue(textInput, 'changed value')
        await changeValue(numberInput, '7')

        expect(onTextInput).toHaveBeenCalledTimes(1)
        expect(textInput.value).toBe('changed value')
        expect(onNumberChange).toHaveBeenCalledTimes(1)
        expect(numberInput.value).toBe('7')
    })

    it('renders checkbox and optional input states without app bootstrapping', async () => {
        const onCheckChange = vi.fn()

        const checkbox = renderGui(CheckInput, {
            check: false,
            name: 'Render checkbox',
            onChange: onCheckChange,
        })
        const optionalText = renderGui(OptionalInput, {
            value: null,
        })
        const optionalNumber = renderGui(OptionalInput, {
            value: 12,
            numberMode: true,
            marginBottom: true,
        })
        const optionalBoolean = renderGui(OptionalInput, {
            value: false,
            boolMode: true,
        })

        const checkboxInput = checkbox.getBySelector<HTMLInputElement>('input[type="checkbox"]')
        expect(checkbox.target.querySelector('label')?.textContent).toContain('Render checkbox')
        expect(checkboxInput.checked).toBe(false)
        expect(checkbox.target.querySelector('svg')).toBeNull()

        checkboxInput.click()
        await tick()

        expect(onCheckChange).toHaveBeenCalledWith(true)
        expect(checkboxInput.checked).toBe(true)
        expect(checkbox.target.querySelector('svg')).not.toBeNull()

        const defaultInput = optionalText.getBySelector<HTMLInputElement>('input[type="text"]')
        expect(defaultInput.value).toBe('Using default')
        expect(defaultInput.disabled).toBe(true)

        const optionalNumberInput = optionalNumber.getBySelector<HTMLInputElement>('input[type="number"]')
        expect(optionalNumberInput.value).toBe('12')
        expect(optionalNumber.target.firstElementChild?.classList.contains('mb-4')).toBe(true)

        const booleanButtons = Array.from(optionalBoolean.target.querySelectorAll<HTMLButtonElement>('button'))
        expect(booleanButtons.map((button) => button.textContent?.trim())).toEqual(['True', 'False'])
        expect(booleanButtons[0].classList.contains('text-textcolor2')).toBe(true)
        expect(booleanButtons[1].classList.contains('text-textcolor2')).toBe(false)

        booleanButtons[0].click()
        await tick()

        expect(booleanButtons[0].classList.contains('text-textcolor2')).toBe(false)
        expect(booleanButtons[1].classList.contains('text-textcolor2')).toBe(true)
    })

    it('renders select, option, and segmented selection controls', async () => {
        const onSelectChange = vi.fn()

        const option = renderGui(OptionInput, {
            value: 'standalone',
            selected: true,
            children: htmlSnippet('<span>Standalone</span>'),
        })
        const select = renderGui(SelectInput, {
            value: 'basic',
            onchange: onSelectChange,
            children: htmlSnippet('<option value="basic">Basic</option>'),
        })
        const segmented = renderGui(SegmentedControl, {
            value: 'list',
            options: [
                { value: 'list', label: 'List' },
                { value: 'card', label: 'Card' },
                { value: 'grid', label: 'Grid' },
            ],
        })

        const optionElement = option.getBySelector<HTMLOptionElement>('option')
        expect(optionElement.value).toBe('standalone')
        expect(optionElement.selected).toBe(true)
        expect(optionElement.textContent?.trim()).toBe('Standalone')

        const selectElement = select.getBySelector<HTMLSelectElement>('select')
        expect(selectElement.value).toBe('basic')
        expect(selectElement.options).toHaveLength(1)

        await changeValue(selectElement, 'basic')
        expect(onSelectChange).toHaveBeenCalledTimes(1)

        const buttons = Array.from(segmented.target.querySelectorAll<HTMLButtonElement>('[data-segment-btn]'))
        expect(buttons.map((button) => button.textContent?.trim())).toEqual(['List', 'Card', 'Grid'])
        expect(buttons[0].classList.contains('segmented-btn-active')).toBe(true)
        expect(segmented.target.querySelector('.segmented-indicator')).not.toBeNull()

        buttons[2].click()
        await tick()

        expect(buttons[0].classList.contains('segmented-btn-active')).toBe(false)
        expect(buttons[2].classList.contains('segmented-btn-active')).toBe(true)
    })

    it('renders slider semantics and supports keyboard changes', async () => {
        const slider = renderGui(SliderInput, {
            min: 0,
            max: 10,
            value: 4,
            step: 2,
            fixed: 0,
            multiple: 1,
        })
        const disableableSlider = renderGui(SliderInput, {
            min: 0,
            max: 10,
            value: -1000,
            disableable: true,
        })

        const sliderElement = slider.getBySelector<HTMLDivElement>('[role="slider"]')
        expect(sliderElement.getAttribute('aria-valuemin')).toBe('0')
        expect(sliderElement.getAttribute('aria-valuemax')).toBe('10')
        expect(sliderElement.getAttribute('aria-valuenow')).toBe('4')
        expect(sliderElement.getAttribute('aria-valuetext')).toBe('4')

        sliderElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
        await tick()

        expect(sliderElement.getAttribute('aria-valuenow')).toBe('6')
        expect(sliderElement.getAttribute('aria-valuetext')).toBe('6')

        const disableToggle = disableableSlider.getBySelector<HTMLInputElement>('input[type="checkbox"]')
        const disabledSliderElement = disableableSlider.getBySelector<HTMLDivElement>('[role="slider"]')
        expect(disableToggle.checked).toBe(false)
        expect(disabledSliderElement.getAttribute('aria-valuenow')).toBe('0')

        disableToggle.click()
        await tick()

        expect(disableToggle.checked).toBe(true)
        expect(disabledSliderElement.getAttribute('aria-valuenow')).toBe('0')
        expect(disabledSliderElement.getAttribute('aria-valuetext')).toBe('0')
    })
})
