<script lang="ts">
    import type { AlertSeverity } from 'src/ts/alertModel';
    import AlertSeverityIcon from './AlertSeverityIcon.svelte';

    interface Props {
        severity?: AlertSeverity;
        title?: string;
        className?: string;
        children?: import('svelte').Snippet;
    }

    let { severity = 'info', title, className = '', children }: Props = $props();

    const severityClasses: Record<AlertSeverity, string> = {
        info: 'border-blue-500/40 text-blue-400 bg-textcolor/5',
        success: 'border-green-500/40 text-green-400 bg-textcolor/5',
        warning: 'border-yellow-500/40 text-yellow-400 bg-textcolor/5',
        error: 'border-draculared/50 text-draculared bg-textcolor/5',
        neutral: 'border-darkborderc text-textcolor2 bg-textcolor/5',
    };
</script>

<div class="flex gap-3 rounded-md border p-3 text-sm {severityClasses[severity]} {className}">
    <div class="mt-0.5 shrink-0">
        <AlertSeverityIcon {severity} />
    </div>
    <div class="min-w-0 flex-1 text-textcolor">
        {#if title}
            <div class="mb-1 font-semibold text-textcolor">{title}</div>
        {/if}
        <div class="whitespace-pre-wrap text-textcolor2">
            {@render children?.()}
        </div>
    </div>
</div>
