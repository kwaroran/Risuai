<script lang="ts">
    // import { getNanoGPTModelProviders } from 'src/ts/model/nanogpt'
    // import type { NanoGPTModelProviders } from 'src/ts/model/nanogpt'
    // TODO: CORS issue — NanoGPT's /api/models/:id/providers does not set
    // Access-Control-Allow-Origin, so browser blocks the request.
    // Auto-fetch disabled until NanoGPT fixes CORS on that endpoint.

    interface Props {
        apiKey: string
        modelId: string
        value: string
    }

    let { apiKey, modelId, value = $bindable('') }: Props = $props()
</script>

{#if apiKey && modelId}
    <div class="mt-2 flex flex-col gap-1">
        <span class="text-sm text-textcolor2">Provider <span class="text-xs opacity-60">(optional)</span></span>
        <input
            type="text"
            bind:value
            placeholder="e.g. openai  (leave blank for auto)"
            class="rounded-md border border-darkborderc bg-bgcolor px-3 py-1.5 text-sm text-textcolor placeholder-textcolor2 outline-none focus:border-selected"
        />
    </div>
{/if}
