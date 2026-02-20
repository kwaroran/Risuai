<script lang="ts">
    import { tick } from 'svelte';
    interface SegmentOption {
        value: string | number;
        label: string;
    }

    interface Props {
        value: string | number;
        options: SegmentOption[];
        size?: 'sm' | 'md' | 'lg';
        className?: string;
    }

    let {
        value = $bindable(),
        options = [],
        size = 'md',
        className = '',
    }: Props = $props();

    let containerRef: HTMLDivElement | undefined = $state();
    let indicatorStyle = $state('');

    // Compute the active index from the current value
    let activeIndex = $derived(options.findIndex(opt => opt.value === value));

    function updateIndicator() {
        if (!containerRef || activeIndex < 0) {
            indicatorStyle = '';
            return;
        }
        const buttons = containerRef.querySelectorAll<HTMLButtonElement>('[data-segment-btn]');
        const activeBtn = buttons[activeIndex];
        if (!activeBtn) {
            indicatorStyle = '';
            return;
        }
        const containerRect = containerRef.getBoundingClientRect();
        const btnRect = activeBtn.getBoundingClientRect();
        const x = btnRect.left - containerRect.left;
        const width = btnRect.width;
        indicatorStyle = `transform: translateX(${x}px); width: ${width}px;`;
    }

    // Re-calculate indicator when activeIndex changes or on mount
    $effect(() => {
        void activeIndex;
        tick().then(() => updateIndicator());
    });

    function handleSelect(opt: SegmentOption) {
        value = opt.value;
    }
</script>

<div
    class="segmented-control-container {className}"
    bind:this={containerRef}
>
    <!-- Sliding indicator -->
    <div
        class="segmented-indicator"
        style={indicatorStyle}
    ></div>

    {#each options as opt (opt.value)}
        <button
            data-segment-btn
            type="button"
            class="segmented-btn"
            class:segmented-btn-active={opt.value === value}
            class:text-xs={size === 'sm'}
            class:text-sm={size === 'md'}
            class:text-base={size === 'lg'}
            class:px-2={size === 'sm'}
            class:py-1={size === 'sm'}
            class:px-4={size === 'md'}
            class:py-2={size === 'md'}
            class:px-6={size === 'lg'}
            class:py-3={size === 'lg'}
            onclick={() => handleSelect(opt)}
        >
            {opt.label}
        </button>
    {/each}
</div>

<style>
    .segmented-control-container {
        position: relative;
        display: inline-flex;
        width: fit-content;
        align-items: center;
        border-radius: 0.5rem;
        background-color: var(--risu-theme-darkbg);
        border: 1px solid var(--risu-theme-darkborderc);
        padding: 4px;
        gap: 2px;
        user-select: none;
    }

    .segmented-indicator {
        position: absolute;
        left: 0;
        top: 4px;
        bottom: 4px;
        border-radius: 0.375rem;
        background-color: var(--risu-theme-borderc);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
                    width 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        will-change: transform, width;
        pointer-events: none;
        z-index: 0;
    }

    .segmented-btn {
        position: relative;
        z-index: 1;
        border: none;
        background: transparent;
        color: var(--risu-theme-textcolor2);
        font-weight: 500;
        border-radius: 0.375rem;
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.2s ease;
        line-height: 1.4;
    }

    .segmented-btn:hover:not(.segmented-btn-active) {
        color: var(--risu-theme-textcolor);
    }

    .segmented-btn-active {
        color: #fff;
    }

    .segmented-btn:focus-visible {
        outline: 2px solid var(--risu-theme-borderc);
        outline-offset: -2px;
    }
</style>
