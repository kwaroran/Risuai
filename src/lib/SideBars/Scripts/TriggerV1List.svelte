<script lang="ts">
  import { PlusIcon } from '@lucide/svelte'
  import Sortable from 'sortablejs'
  import type { triggerscript } from 'src/ts/storage/database.svelte'
  import { sleep, sortableOptions } from 'src/ts/util'
  import { onDestroy, onMount } from 'svelte'
  import TriggerData from './TriggerV1Data.svelte'

  interface Props {
    value?: triggerscript[]
    lowLevelAble?: boolean
  }

  let { value = $bindable([]), lowLevelAble = false }: Props = $props()
  let stb: Sortable = null
  let ele: HTMLDivElement = $state()
  let sorted = $state(0)
  let opened = 0

  const createStb = () => {
    if (!ele) {
      return
    }
    stb = Sortable.create(ele, {
      onEnd: async () => {
        let idx: number[] = []
        ele.querySelectorAll('[data-risu-idx2]').forEach((e, i) => {
          idx.push(parseInt(e.getAttribute('data-risu-idx2')))
        })
        let newValue: triggerscript[] = []
        idx.forEach((i) => {
          newValue.push(value[i])
        })
        value = newValue
        try {
          stb.destroy()
        } catch (error) {}
        sorted += 1
        await sleep(1)
        createStb()
      },
      ...sortableOptions,
    })
  }

  const onOpen = () => {
    opened += 1
    if (stb) {
      try {
        stb.destroy()
      } catch (error) {}
    }
  }
  const onClose = () => {
    opened -= 1
    if (opened === 0) {
      createStb()
    }
  }

  onMount(createStb)

  onDestroy(() => {
    if (stb) {
      try {
        stb.destroy()
      } catch (error) {}
    }
  })
</script>

{#key sorted}
  <div
    class="contain w-full max-w-full mt-2 flex flex-col border-selected border-1 bg-darkbg rounded-md p-3"
    bind:this={ele}
  >
    {#if value.length === 0}
      <div class="text-textcolor2">No Scripts</div>
    {/if}
    {#each value as triggerscript, i}
      <TriggerData
        idx={i}
        bind:value={value[i]}
        {lowLevelAble}
        {onOpen}
        {onClose}
        onRemove={() => {
          let triggerscript = value
          triggerscript.splice(i, 1)
          value = triggerscript
        }}
      />
    {/each}
  </div>
  <button
    class="font-medium cursor-pointer hover:text-textcolor mb-2 text-textcolor2"
    onclick={() => {
      value.push({
        comment: '',
        type: 'start',
        conditions: [],
        effect: [],
      })
      value = value
    }}
  >
    <PlusIcon />
  </button>
{/key}
