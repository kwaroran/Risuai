<script lang="ts">
    import { AlertCircleIcon, CheckCircleIcon, InfoIcon, TriangleAlertIcon, CircleIcon } from '@lucide/svelte';
    import type { AlertSeverity } from 'src/ts/alertModel';

    interface Props {
        severity: AlertSeverity;
        size?: number;
    }

    let { severity, size = 18 }: Props = $props();
</script>

{#if severity === 'error'}
    <AlertCircleIcon {size} />
{:else if severity === 'warning'}
    <TriangleAlertIcon {size} />
{:else if severity === 'success'}
    <CheckCircleIcon {size} />
{:else if severity === 'info'}
    <InfoIcon {size} />
{:else}
    <CircleIcon {size} />
{/if}
