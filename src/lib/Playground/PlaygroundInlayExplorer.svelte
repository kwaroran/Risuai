<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity'

  import { language } from 'src/lang'
  import { alertConfirm } from 'src/ts/alert'
  import { listInlayAssets, getInlayAssetBlob, removeInlayAsset, type InlayAssetBlob } from 'src/ts/process/files/inlays'
  import Button from '../UI/GUI/Button.svelte'
  import CheckInput from '../UI/GUI/CheckInput.svelte'

  const PAGE_SIZE = 36

  let allAssets = $state<[string, InlayAssetBlob][]>([])
  let displayCount = $state(PAGE_SIZE)
  let loading = $state(true)
  // For revoking
  let previewURLs = $state<Map<string, string>>(new Map())
  let selection = $state<Set<string>>(new SvelteSet())

  const displayedAssets = $derived(allAssets.slice(0, displayCount))
  const hasMore = $derived(displayCount < allAssets.length)
  const hasSelection = $derived(selection.size > 0)

  const getPreviewURL = async (id: string) => {
    if (previewURLs.has(id)) return previewURLs.get(id)!
    const result = await getInlayAssetBlob(id)
    if (result) {
      const url = URL.createObjectURL(result.data)
      previewURLs.set(id, url)
      return url
    }
    return null
  }

  const toggleSelect = (id: string) => {
    if (selection.has(id)) {
      selection.delete(id)
    } else {
      selection.add(id)
    }
  }

  const selectAll = () => {
    displayedAssets.forEach(([id]) => selection.add(id))
  }

  const deselectAll = () => {
    selection.clear()
  }

  const deleteAsset = async (id: string, name: string) => {
    if (!(await alertConfirm(language.playground.inlayDeleteConfirm(name)))) {
      return
    }
    await removeInlayAsset(id)
    if (previewURLs.has(id)) {
      URL.revokeObjectURL(previewURLs.get(id)!)
      previewURLs.delete(id)
    }
    selection.delete(id)
    allAssets = allAssets.filter(([assetId]) => assetId !== id)
  }

  const deleteSelected = async () => {
    if (selection.size === 0) return
    if (!(await alertConfirm(language.playground.inlayDeleteMultipleConfirm(selection.size)))) {
      return
    }
    for (const id of selection) {
      await removeInlayAsset(id)
      if (previewURLs.has(id)) {
        URL.revokeObjectURL(previewURLs.get(id)!)
        previewURLs.delete(id)
      }
    }
    allAssets = allAssets.filter(([assetId]) => !selection.has(assetId))
    selection.clear()
  }

  const loadMore = () => {
    displayCount += PAGE_SIZE
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getAssetSize = (asset: InlayAssetBlob) => {
    return formatSize(asset.data.size)
  }

  const loadAssets = async () => {
    loading = true
    // Clean up old URLs
    previewURLs.forEach((url) => URL.revokeObjectURL(url))
    previewURLs = new Map()
    selection = new SvelteSet()
    displayCount = PAGE_SIZE
    allAssets = await listInlayAssets()
    loading = false
  }
  loadAssets()
</script>

<h2 class="text-4xl text-textcolor mt-6 font-black relative">{language.playground.inlayExplorer}</h2>

<header class="flex flex-wrap gap-4 py-6 items-center sticky top-0 bg-bgcolor">
  <span class="text-textcolor2">{language.playground.inlayTotalAssets(allAssets.length)}</span>
  {#if allAssets.length > 0}
    <div class="flex gap-2 ml-auto">
      {#if hasSelection}
        <Button onclick={deleteSelected} styled="danger" size="sm">{language.playground.inlayDeleteSelected}</Button>
        <Button onclick={deselectAll} styled="primary" size="sm"
          >{language.playground.inlayDeselectAll} ({selection.size})</Button
        >
      {:else}
        <Button onclick={selectAll} styled="primary" size="sm">{language.playground.inlaySelectAll}</Button>
      {/if}
    </div>
  {/if}
</header>

{#if allAssets.length === 0 && !loading}
  <div class="text-center py-12 text-textcolor2">
    <p class="text-lg">{language.playground.inlayEmpty}</p>
    <p class="text-sm mt-2">{language.playground.inlayEmptyDesc}</p>
  </div>
{:else if loading}
  <div class="text-center py-12 text-textcolor2">
    <!-- Won't take long, not worth localizing -->
    <p class="text-lg">Loading...</p>
  </div>
{:else}
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each displayedAssets as [id, asset] (id)}
      {#key selection.has(id)}
        <div class="border border-darkborderc rounded-lg p-4 bg-darkbg">
          <div class="flex items-center gap-2 mb-3">
            <CheckInput check={selection.has(id)} hiddenName margin={false} onChange={() => toggleSelect(id)} />
            <span class="px-2 py-1 text-xs rounded bg-darkbutton text-textcolor2">
              {asset.type}
            </span>
          </div>
          <div class="mb-3">
            {#if asset.type === 'image'}
              {#await getPreviewURL(id) then url}
                {#if url}
                  <img alt={asset.name} class="w-full h-40 object-contain rounded bg-black/20" src={url} />
                {/if}
              {/await}
            {:else if asset.type === 'video'}
              {#await getPreviewURL(id) then url}
                {#if url}
                  <video class="w-full h-40 object-contain rounded bg-black/20" controls src={url}>
                    <track kind="captions" />
                  </video>
                {/if}
              {/await}
            {:else if asset.type === 'audio'}
              {#await getPreviewURL(id) then url}
                {#if url}
                  <audio class="w-full" controls src={url}>
                    <track kind="captions" />
                  </audio>
                {/if}
              {/await}
            {/if}
          </div>

          <div class="flex justify-between items-start mb-2">
            <div class="flex-1 min-w-0">
              <p class="text-textcolor font-medium truncate" title={asset.name}>{asset.name}</p>
              {#if asset.name !== id}
                <p class="text-textcolor2 text-xs truncate" title={id}>{id}</p>
              {/if}
            </div>
          </div>

          <div class="text-textcolor2 text-sm mb-3">
            {#if asset.width && asset.height}
              <span>{asset.width}x{asset.height} • </span>
            {/if}
            <span>{getAssetSize(asset)}</span>
          </div>

          <Button onclick={() => deleteAsset(id, asset.name)} styled="danger" size="sm">Delete</Button>
        </div>
      {/key}
    {/each}
  </div>

  {#if hasMore}
    <div class="my-6 text-center">
      <Button onclick={loadMore} styled="outlined">
        {language.playground.inlayLoadMore(allAssets.length - displayCount)}
      </Button>
    </div>
  {/if}
{/if}
