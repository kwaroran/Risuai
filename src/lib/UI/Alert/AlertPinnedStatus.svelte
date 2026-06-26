<script lang="ts">
    import { CheckIcon, GaugeIcon, ArrowDownToLineIcon, ArrowUpFromLineIcon, XIcon } from '@lucide/svelte';
    import type { AlertSeverity } from 'src/ts/alertModel';
    import { clearPinnedStatus, pinnedStatusStore } from 'src/ts/alert';
    import { language } from 'src/lang';
    import { DBState } from 'src/ts/stores.svelte';
    import AlertSeverityIcon from './AlertSeverityIcon.svelte';

    const severityConfig: Record<AlertSeverity, {
        iconColor: string;
        chipBg: string;
        accent: string;
        glow: string;
    }> = {
        success: {
            iconColor: 'rgb(52 211 153)',
            chipBg: 'rgb(52 211 153 / 0.16)',
            accent: 'rgb(52 211 153 / 0.55)',
            glow: 'rgb(52 211 153 / 0.22)',
        },
        info: {
            iconColor: 'rgb(96 165 250)',
            chipBg: 'rgb(96 165 250 / 0.16)',
            accent: 'rgb(96 165 250 / 0.55)',
            glow: 'rgb(96 165 250 / 0.22)',
        },
        warning: {
            iconColor: 'rgb(251 191 36)',
            chipBg: 'rgb(251 191 36 / 0.16)',
            accent: 'rgb(251 191 36 / 0.55)',
            glow: 'rgb(251 191 36 / 0.22)',
        },
        error: {
            iconColor: 'rgb(248 113 113)',
            chipBg: 'rgb(248 113 113 / 0.16)',
            accent: 'rgb(248 113 113 / 0.55)',
            glow: 'rgb(248 113 113 / 0.22)',
        },
        neutral: {
            iconColor: 'rgb(156 163 175)',
            chipBg: 'rgb(156 163 175 / 0.16)',
            accent: 'rgb(156 163 175 / 0.45)',
            glow: 'rgb(0 0 0 / 0.2)',
        },
    };

    const pinnedStatusFontSize = $derived(`${0.875 * ((DBState.db?.zoomsize ?? 100) / 100)}rem`);
    const pinnedStatusPosition = $derived(DBState.db?.toastPosition === 'topRight' ? 'topRight' : 'topCenter');
    const pinnedStatusPositionClass = $derived(
        pinnedStatusPosition === 'topRight' ? 'position-top-right' : 'position-top-center'
    );
</script>

{#if $pinnedStatusStore.length > 0}
    <div
        class="pinned-status-stack {pinnedStatusPositionClass} fixed top-4 z-50 flex flex-col gap-2 pointer-events-none break-any"
        style:--pinned-status-font-size={pinnedStatusFontSize}
    >
        {#each $pinnedStatusStore as item (item.key)}
            {@const config = severityConfig[item.severity]}
            <section
                class="pinned-status-card pointer-events-auto {item.kind === 'token' ? 'token-counter-card' : ''}"
                style:--pinned-icon-color={config.iconColor}
                style:--pinned-chip-bg={config.chipBg}
                style:--pinned-accent={config.accent}
                style:--pinned-glow={config.glow}
                role="status"
                aria-live="polite"
            >
                {#if item.kind === 'token'}
                    <div class="pinned-token-counter">
                        <div class="pinned-token-counter-head">
                            <span class="pinned-status-chip pinned-token-counter-chip" aria-hidden="true">
                                <GaugeIcon size={15} strokeWidth={2.4} />
                            </span>
                            <span class="pinned-status-title">{item.title}</span>
                            <button
                                type="button"
                                class="pinned-status-close pinned-token-counter-close"
                                aria-label="Close token counter"
                                onclick={() => clearPinnedStatus(item.key)}
                            >
                                <XIcon size={16} />
                            </button>
                        </div>
                        <div class="pinned-token-counter-rows">
                            <div class="pinned-token-row pinned-token-row-input">
                                <span class="pinned-token-row-icon" aria-hidden="true">
                                    <ArrowDownToLineIcon size={14} strokeWidth={2.4} />
                                </span>
                                <span class="pinned-token-row-label">{language.input}</span>
                                <span class="pinned-token-row-value">{(item.tokenInput ?? 0).toLocaleString()}</span>
                                <span class="pinned-token-row-unit">{language.tokens}</span>
                            </div>
                            <div class="pinned-token-row pinned-token-row-output">
                                <span class="pinned-token-row-icon" aria-hidden="true">
                                    <ArrowUpFromLineIcon size={14} strokeWidth={2.4} />
                                </span>
                                <span class="pinned-token-row-label">{language.output}</span>
                                <span class="pinned-token-row-value">{(item.tokenOutput ?? 0).toLocaleString()}</span>
                                <span class="pinned-token-row-unit">{language.tokens}</span>
                            </div>
                        </div>
                    </div>
                {:else}
                    <div class="pinned-status-row">
                        <span class="pinned-status-chip" aria-hidden="true">
                            {#if item.severity === 'success'}
                                <CheckIcon size={16} strokeWidth={2.6} />
                            {:else}
                                <AlertSeverityIcon severity={item.severity} size={16} />
                            {/if}
                        </span>
                        <div class="pinned-status-copy">
                            <div class="pinned-status-heading">
                                <span class="pinned-status-title">{item.title}</span>
                                {#if item.value}
                                    <span class="pinned-status-value">{item.value}</span>
                                {/if}
                            </div>
                            {#if item.message}
                                <p class="pinned-status-message">{item.message}</p>
                            {/if}
                            {#if item.detail}
                                <p class="pinned-status-detail">{item.detail}</p>
                            {/if}
                        </div>
                        <button
                            type="button"
                            class="pinned-status-close"
                            aria-label="Close pinned status"
                            onclick={() => clearPinnedStatus(item.key)}
                        >
                            <XIcon size={16} />
                        </button>
                    </div>
                {/if}
            </section>
        {/each}
    </div>
{/if}

<style>
    .break-any {
        word-break: normal;
        overflow-wrap: anywhere;
    }

    .position-top-center {
        left: 50%;
        transform: translateX(-50%);
        transform-origin: top center;
    }

    .position-top-right {
        right: 1rem;
        transform-origin: top right;
    }

    .pinned-status-stack {
        width: fit-content;
        max-width: min(calc(100vw - 2rem), 38em);
        font-size: var(--pinned-status-font-size, 0.875rem);
    }

    .pinned-status-card {
        box-sizing: border-box;
        width: 100%;
        max-height: min(18em, 70vh);
        padding: 0.6em 0.6em 0.6em 0.6em;
        border-radius: 0.375rem;
        border: 1px solid color-mix(in srgb, var(--pinned-accent) 70%, var(--risu-theme-darkborderc, rgb(75 75 75)));
        background: color-mix(in srgb, var(--risu-theme-darkbg, rgb(17 17 17)) 88%, transparent);
        color: var(--risu-theme-textcolor, #e5e5e5);
        line-height: 1.35;
        backdrop-filter: blur(10px);
        animation: pinned-status-enter 180ms cubic-bezier(0.16, 1, 0.3, 1);
        will-change: transform, opacity;
        overflow-y: auto;
        box-shadow:
            0 10px 30px -8px rgb(0 0 0 / 0.55),
            0 0 0 1px color-mix(in srgb, var(--pinned-accent) 25%, transparent),
            0 0 22px -6px var(--pinned-glow);
    }

    .token-counter-card {
        padding: 0.7em 0.85em;
    }

    .pinned-token-counter {
        display: flex;
        flex-direction: column;
        gap: 0.55em;
        min-width: min(28em, calc(100vw - 4rem));
    }

    .pinned-token-counter-head {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.55em;
        padding-bottom: 0.45em;
        border-bottom: 1px solid color-mix(in srgb, var(--pinned-accent) 32%, transparent);
    }

    .pinned-token-counter-chip {
        width: 1.65em;
        height: 1.65em;
    }

    .pinned-token-counter-close {
        justify-self: end;
    }

    .pinned-token-counter-rows {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 0.45em;
    }

    .pinned-token-row {
        display: grid;
        grid-template-columns: auto minmax(0, 1fr) auto auto;
        align-items: center;
        min-width: 0;
        min-height: 2.45em;
        gap: 0.45em;
        padding: 0.38em 0.55em;
        border-radius: 0.3rem;
        background: color-mix(in srgb, var(--pinned-chip-bg) 45%, transparent);
    }

    .pinned-token-row-icon {
        display: inline-flex;
        align-self: center;
        color: var(--pinned-icon-color);
    }

    .pinned-token-row-icon :global(svg) {
        display: block;
        width: 0.95em;
        height: 0.95em;
    }

    .pinned-token-row-label {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 0.82em;
        font-weight: 600;
        line-height: 1;
        color: color-mix(in srgb, var(--risu-theme-textcolor2, #a3a3a3) 92%, transparent);
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }

    .pinned-token-row-value {
        font-size: 1.12em;
        font-weight: 700;
        line-height: 1;
        font-variant-numeric: tabular-nums;
        color: var(--risu-theme-textcolor, #e5e5e5);
        font-feature-settings: 'tnum';
        white-space: nowrap;
    }

    .pinned-token-row-unit {
        font-size: 0.72em;
        font-weight: 500;
        line-height: 1;
        color: color-mix(in srgb, var(--risu-theme-textcolor2, #a3a3a3) 80%, transparent);
        white-space: nowrap;
    }

    .pinned-token-row-output .pinned-token-row-value {
        color: var(--pinned-icon-color);
    }

    .pinned-status-row {
        display: flex;
        align-items: center;
        gap: 0.75em;
        min-width: 0;
    }

    .pinned-status-chip {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 1.9em;
        height: 1.9em;
        border-radius: 9999px;
        background: var(--pinned-chip-bg);
        color: var(--pinned-icon-color);
    }

    .pinned-status-chip :global(svg) {
        display: block;
        width: 1.08em;
        height: 1.08em;
    }

    .pinned-status-copy {
        flex: 1 1 auto;
        min-width: 0;
    }

    .pinned-status-heading {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-width: 0;
        min-height: 1.9em;
    }

    .pinned-status-title {
        min-width: 0;
        overflow-wrap: anywhere;
        font-weight: 700;
        line-height: 1.2;
    }

    .pinned-status-value {
        flex: none;
        color: var(--pinned-icon-color);
        font-size: 0.85em;
        font-weight: 700;
        line-height: 1.2;
    }

    .pinned-status-message,
    .pinned-status-detail {
        margin: 0.25rem 0 0;
        overflow-wrap: anywhere;
        white-space: pre-wrap;
        font-size: 0.85em;
        line-height: 1.35;
    }

    .pinned-status-message {
        color: color-mix(in srgb, var(--risu-theme-textcolor, #e5e5e5) 88%, transparent);
    }

    .pinned-status-detail {
        color: var(--risu-theme-textcolor2, #a3a3a3);
    }

    .pinned-status-close {
        display: inline-flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 1.8em;
        height: 1.8em;
        border-radius: 0.375rem;
        color: var(--risu-theme-textcolor2, #a3a3a3);
        transition:
            background-color 120ms ease,
            color 120ms ease;
    }

    .pinned-status-close:hover {
        background: color-mix(in srgb, var(--pinned-accent) 22%, transparent);
        color: var(--risu-theme-textcolor, #e5e5e5);
    }

    .pinned-status-close :global(svg) {
        display: block;
        width: 1.08em;
        height: 1.08em;
    }

    @keyframes pinned-status-enter {
        from {
            opacity: 0;
            transform: translateY(-130%) scale(0.96);
        }

        to {
            opacity: 1;
            transform: translateY(0) scale(1);
        }
    }
</style>
