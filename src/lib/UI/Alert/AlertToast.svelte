<script lang="ts">
    import { CheckIcon } from '@lucide/svelte';
    import { DBState } from 'src/ts/stores.svelte';
    import type { AlertSeverity } from 'src/ts/alertModel';
    import AlertSeverityIcon from './AlertSeverityIcon.svelte';
    import { alertSeverityStyles } from './alertSeverityStyles';

    const TOAST_VISIBLE_MS = 2000;
    const TOAST_EXIT_MS = 180;

    interface Props {
        message: string;
        severity: AlertSeverity;
        count?: number;
        refreshKey: unknown;
        onDone: () => void;
    }

    let { message, severity, count = 1, refreshKey, onDone }: Props = $props();
    let entered = $state(false);
    let dismissing = $state(false);
    let enterTimer: ReturnType<typeof setTimeout> | undefined;
    let visibleTimer: ReturnType<typeof setTimeout> | undefined;
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;

    const config = $derived(alertSeverityStyles[severity]);
    const toastFontSize = $derived(`${0.875 * ((DBState.db.zoomsize ?? 100) / 100)}rem`);
    const toastPosition = $derived(DBState.db.toastPosition === 'topRight' ? 'topRight' : 'topCenter');
    const toastPositionClass = $derived(toastPosition === 'topRight' ? 'position-top-right' : 'position-top-center');

    function clearToastTimers() {
        if (enterTimer) {
            clearTimeout(enterTimer);
            enterTimer = undefined;
        }

        if (visibleTimer) {
            clearTimeout(visibleTimer);
            visibleTimer = undefined;
        }

        if (dismissTimer) {
            clearTimeout(dismissTimer);
            dismissTimer = undefined;
        }
    }

    function closeToast() {
        clearToastTimers();
        onDone();
    }

    function startToastCountdown() {
        clearToastTimers();
        entered = false;
        dismissing = false;

        enterTimer = setTimeout(() => {
            entered = true;
            enterTimer = undefined;
        }, 0);

        visibleTimer = setTimeout(() => {
            dismissing = true;
            dismissTimer = setTimeout(closeToast, TOAST_EXIT_MS);
        }, TOAST_VISIBLE_MS);
    }

    $effect(() => {
        message;
        refreshKey;

        startToastCountdown();

        return clearToastTimers;
    });
</script>

<div
    class:entered
    class:dismissing
    class="toast-shell {toastPositionClass} fixed top-4 z-50 flex items-center gap-3 overflow-y-auto break-any"
    style:--toast-icon-color={config.iconColor}
    style:--toast-chip-bg={config.chipBg}
    style:--toast-accent={config.accent}
    style:--toast-glow={config.glow}
    style:--toast-font-size={toastFontSize}
    role="status"
    aria-live="polite"
>
    <span class="toast-chip" aria-hidden="true">
        {#if severity === 'success'}
            <CheckIcon size={16} strokeWidth={2.6} />
        {:else}
            <AlertSeverityIcon severity={severity} size={16} />
        {/if}
    </span>
    <span class="toast-msg">{message}</span>
    {#if count > 1}
        <span class="toast-count" aria-label={`${count} notifications`}>{count > 9 ? '9+' : count}</span>
    {/if}
</div>

<style>
    .break-any {
        word-break: normal;
        overflow-wrap: anywhere;
    }

    .position-top-center {
        left: 50%;
        --toast-enter-transform: translate(-50%, -130%) scale(0.96);
        --toast-visible-transform: translate(-50%, 0) scale(1);
        transform-origin: top center;
    }

    .position-top-right {
        right: 1rem;
        --toast-enter-transform: translate(0, -130%) scale(0.96);
        --toast-visible-transform: translate(0, 0) scale(1);
        transform-origin: top right;
    }

    .toast-shell {
        box-sizing: border-box;
        width: fit-content;
        max-width: min(calc(100vw - 2rem), 38em);
        max-height: min(18em, 70vh);
        padding: 0.6em 1em 0.6em 0.6em;
        border-radius: 0.375rem;
        border: 1px solid color-mix(in srgb, var(--toast-accent) 70%, var(--risu-theme-darkborderc, rgb(75 75 75)));
        background: color-mix(in srgb, var(--risu-theme-darkbg, rgb(17 17 17)) 88%, transparent);
        color: var(--risu-theme-textcolor, #e5e5e5);
        font-size: var(--toast-font-size, 0.875rem);
        line-height: 1.35;
        backdrop-filter: blur(10px);
        opacity: 0;
        transform: var(--toast-enter-transform);
        box-shadow:
            0 10px 30px -8px rgb(0 0 0 / 0.55),
            0 0 0 1px color-mix(in srgb, var(--toast-accent) 25%, transparent),
            0 0 22px -6px var(--toast-glow);
        transition:
            opacity 180ms cubic-bezier(0.16, 1, 0.3, 1),
            transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform, opacity;
    }

    .toast-shell.entered {
        opacity: 1;
        transform: var(--toast-visible-transform);
    }

    .toast-shell.dismissing {
        pointer-events: none;
        opacity: 0;
        transform: var(--toast-enter-transform);
        transition-timing-function: ease-in;
    }

    .toast-chip {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 1.9em;
        height: 1.9em;
        border-radius: 9999px;
        background: var(--toast-chip-bg);
        color: var(--toast-icon-color);
    }

    .toast-chip :global(svg) {
        display: block;
        width: 1.08em;
        height: 1.08em;
    }

    .toast-msg {
        flex: 1 1 auto;
        min-width: 0;
        text-align: left;
        white-space: pre-wrap;
    }

    .toast-count {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        min-width: 1.7em;
        height: 1.7em;
        padding: 0 0.48em;
        border-radius: 9999px;
        background: color-mix(in srgb, var(--toast-accent) 28%, var(--risu-theme-darkbutton, rgb(40 40 40)));
        color: var(--risu-theme-textcolor, #e5e5e5);
        font-size: 0.78em;
        font-weight: 700;
        line-height: 1;
    }
</style>
