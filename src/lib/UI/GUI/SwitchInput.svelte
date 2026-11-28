<script lang="ts">
    interface Props {
        check?: boolean;
        onChange?: (check: boolean) => any;
        id?: string;
        /** Only an aria-label; unlike CheckInput, no text is rendered. */
        name?: string;
        disabled?: boolean;
        className?: string;
    }

    let {
        // No fallback: settings that were never set bind undefined, which Svelte rejects for props with a fallback.
        check = $bindable(),
        onChange = (check: boolean) => {},
        id,
        name,
        disabled = false,
        className = '',
    }: Props = $props();
</script>

<!-- The real input overlays the visible track, so focusing it never scrolls the page.
     Sizes are in rem to keep the knob centred at any root font size. -->
<span
    class="rs-switch relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-borderc {check ? 'bg-(--risu-switch-on)' : 'bg-(--risu-switch-off)'} {disabled ? 'opacity-50' : ''} {className}"
>
    <input
        {id}
        type="checkbox"
        role="switch"
        class="absolute inset-0 m-0 h-full w-full appearance-none rounded-full opacity-0 {disabled ? 'cursor-not-allowed' : 'cursor-pointer'}"
        aria-label={name || undefined}
        {disabled}
        bind:checked={check}
        onchange={() => onChange(check)}
    />
    <span
        class="rs-switch-knob pointer-events-none absolute left-0.5 size-5 rounded-full bg-(--risu-switch-knob) transition-transform duration-200 {check ? 'translate-x-5' : 'translate-x-0'}"
        aria-hidden="true"
    ></span>
</span>

<style>
    /* Forced colours would flatten track and knob to Canvas; draw them with system colours.
       box-shadow instead of border so the track keeps its size. */
    @media (forced-colors: active) {
        .rs-switch {
            forced-color-adjust: none;
            background-color: Canvas;
            box-shadow: inset 0 0 0 1px CanvasText;
        }
        .rs-switch:has(input:checked) {
            background-color: Highlight;
            box-shadow: none;
        }
        .rs-switch:has(input:focus-visible) {
            outline-color: CanvasText;
        }
        .rs-switch-knob {
            forced-color-adjust: none;
            background-color: CanvasText;
        }
        .rs-switch:has(input:checked) .rs-switch-knob {
            background-color: HighlightText;
        }
    }
</style>
