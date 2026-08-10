<script lang="ts">
    import { ArrowLeft, ArrowRight, XIcon } from '@lucide/svelte'
    import { untrack } from 'svelte'
    import { language } from 'src/lang'
    import {
        getPatchNoteRelease,
        getPatchNoteReleasePage,
        type PatchNoteRelease,
        type PatchNoteReleasePage,
    } from 'src/ts/patchNotes'
    import {
        closePatchNotesModal,
        patchNotesModalStore,
    } from 'src/ts/patchNotesUi'
    import { parseMarkdownSafe } from 'src/ts/parser/parser.svelte'
    import { appVer } from 'src/ts/storage/database.svelte'
    import Button from '../UI/GUI/Button.svelte'

    let release = $state<PatchNoteRelease | null>(null)
    let releasePage = $state<PatchNoteReleasePage | null>(null)
    let mode = $state<'detail' | 'history'>('detail')
    let loading = $state(false)
    let error = $state('')
    let detailFromHistory = $state(false)
    let historyPage = $state(0)
    let viewedLatest = $state(false)

    async function loadRelease(version: string, initialRelease: PatchNoteRelease | null = null): Promise<void> {
        mode = 'detail'
        loading = true
        error = ''
        release = initialRelease
        try {
            release = initialRelease ?? await getPatchNoteRelease(version)
            if (release.version === appVer) {
                viewedLatest = true
            }
        } catch (loadError) {
            console.error(loadError)
            release = null
            error = language.patchNotes.loadError
        } finally {
            loading = false
        }
    }

    async function loadHistory(page = 0): Promise<void> {
        historyPage = Math.max(0, page)
        mode = 'history'
        loading = true
        error = ''
        try {
            releasePage = await getPatchNoteReleasePage(historyPage)
        } catch (loadError) {
            console.error(loadError)
            releasePage = null
            error = language.patchNotes.listError
        } finally {
            loading = false
        }
    }

    async function openHistoryRelease(version: string): Promise<void> {
        detailFromHistory = true
        await loadRelease(version)
    }

    function close(): void {
        closePatchNotesModal(viewedLatest ? appVer : undefined)
    }

    $effect(() => {
        const requestId = $patchNotesModalStore.requestId
        if (!$patchNotesModalStore.open) {
            return
        }
        const version = $patchNotesModalStore.version
        const initialRelease = $patchNotesModalStore.initialRelease
        untrack(() => {
            detailFromHistory = false
            viewedLatest = false
            void loadRelease(version, initialRelease)
        })
        void requestId
    })
</script>

<svelte:window onkeydown={(event) => {
    if (event.key === 'Escape' && $patchNotesModalStore.open) {
        close()
    }
}} />

{#if $patchNotesModalStore.open}
    <div class="fixed inset-0 z-60 flex items-center justify-center bg-black/60 p-3 md:p-6">
        <div
            aria-modal="true"
            aria-labelledby="patch-notes-title"
            role="dialog"
            class="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-borderc/20 bg-darkbg text-textcolor shadow-2xl"
        >
            <header class="flex items-center gap-3 border-b border-borderc/15 px-4 py-3 md:px-6">
                {#if detailFromHistory || mode === 'history'}
                    <button
                        class="rounded-md p-1.5 text-textcolor2 transition-colors hover:bg-selected hover:text-textcolor"
                        aria-label={language.patchNotes.back}
                        onclick={() => {
                            if (detailFromHistory) {
                                detailFromHistory = false
                                void loadHistory(historyPage)
                            } else {
                                detailFromHistory = false
                                void loadRelease($patchNotesModalStore.version, $patchNotesModalStore.initialRelease)
                            }
                        }}
                    >
                        <ArrowLeft size={20} />
                    </button>
                {/if}
                <div class="min-w-0 grow">
                    <h2 id="patch-notes-title" class="truncate text-xl font-bold">
                        {mode === 'history' ? language.patchNotes.previousTitle : language.patchNotes.title}
                    </h2>
                    {#if mode === 'detail' && release}
                        <p class="text-sm text-textcolor2">Version {release.version}</p>
                    {/if}
                </div>
                <button
                    class="rounded-md p-1.5 text-textcolor2 transition-colors hover:bg-selected hover:text-textcolor"
                    aria-label={language.patchNotes.close}
                    onclick={close}
                >
                    <XIcon size={22} />
                </button>
            </header>

            <div class="min-h-48 grow overflow-y-auto px-4 py-4 md:px-6">
                {#if loading}
                    <div class="flex min-h-40 items-center justify-center text-textcolor2">
                        {language.patchNotes.loading}
                    </div>
                {:else if error}
                    <div class="flex min-h-40 flex-col items-center justify-center gap-4 text-center">
                        <p class="text-textcolor2">{error}</p>
                        <Button onclick={() => {
                            if (mode === 'history') {
                                void loadHistory(historyPage)
                            } else {
                                void loadRelease(release?.version ?? $patchNotesModalStore.version)
                            }
                        }}>{language.patchNotes.retry}</Button>
                    </div>
                {:else if mode === 'history'}
                    {#if releasePage && releasePage.releases.length > 0}
                        <div class="flex flex-col gap-2">
                            {#each releasePage.releases as item}
                                <button
                                    class="w-full rounded-lg border border-borderc/15 bg-bgcolor px-4 py-3 text-left font-medium transition-colors hover:border-borderc/40 hover:bg-selected"
                                    onclick={() => void openHistoryRelease(item.version)}
                                >
                                    {item.version}
                                </button>
                            {/each}
                        </div>
                    {:else}
                        <div class="flex min-h-40 items-center justify-center text-textcolor2">
                            {language.patchNotes.empty}
                        </div>
                    {/if}
                {:else if release}
                    <article class="chattext chattext2 prose max-w-none text-textcolor">
                        {@html parseMarkdownSafe(release.body || language.patchNotes.noContent)}
                    </article>
                {/if}
            </div>

            <footer class="flex flex-wrap items-center gap-2 border-t border-borderc/15 px-4 py-3 md:px-6">
                {#if mode === 'history'}
                    <Button
                        styled="outlined"
                        disabled={!releasePage?.hasPrevious || loading}
                        onclick={() => void loadHistory(historyPage - 1)}
                    >
                        <ArrowLeft class="mr-1 inline" size={16} />
                        {language.patchNotes.previousPage}
                    </Button>
                    <span class="grow text-center text-sm text-textcolor2">
                        {language.patchNotes.page(historyPage + 1)}
                    </span>
                    <Button
                        styled="outlined"
                        disabled={!releasePage?.hasNext || loading}
                        onclick={() => void loadHistory(historyPage + 1)}
                    >
                        {language.patchNotes.nextPage}
                        <ArrowRight class="ml-1 inline" size={16} />
                    </Button>
                {:else if !detailFromHistory}
                    <Button
                        styled="outlined"
                        className="grow"
                        disabled={loading}
                        onclick={() => void loadHistory(0)}
                    >
                        {language.patchNotes.viewPrevious}
                    </Button>
                {:else}
                    <Button
                        styled="outlined"
                        className="grow"
                        onclick={() => {
                            detailFromHistory = false
                            void loadHistory(historyPage)
                        }}
                    >
                        {language.patchNotes.backToList}
                    </Button>
                {/if}
                <Button className={mode === 'history' ? '' : 'grow'} onclick={close}>
                    {language.patchNotes.close}
                </Button>
            </footer>
        </div>
    </div>
{/if}
