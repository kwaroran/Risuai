import { writable } from 'svelte/store'
import { appVer, getDatabase } from './storage/database.svelte'
import { getPatchNoteRelease, type PatchNoteRelease } from './patchNotes'

interface PatchNotesModalState {
    open: boolean
    requestId: number
    version: string
    initialRelease: PatchNoteRelease | null
}

export const patchNotesModalStore = writable<PatchNotesModalState>({
    open: false,
    requestId: 0,
    version: appVer,
    initialRelease: null,
})

let closeResolver: (() => void) | null = null

export function openPatchNotesModal(options: {
    version?: string
    initialRelease?: PatchNoteRelease | null
} = {}): Promise<void> {
    closeResolver?.()
    patchNotesModalStore.update((state) => ({
        open: true,
        requestId: state.requestId + 1,
        version: options.version ?? appVer,
        initialRelease: options.initialRelease ?? null,
    }))

    return new Promise((resolve) => {
        closeResolver = resolve
    })
}

export function closePatchNotesModal(viewedVersion?: string): void {
    if (viewedVersion === appVer) {
        const db = getDatabase()
        db.lastPatchNoteCheckVersion = appVer
        db.isUserViewLastestPatchnote = true
    }

    patchNotesModalStore.update((state) => ({
        ...state,
        open: false,
    }))
    closeResolver?.()
    closeResolver = null
}

export async function showLatestPatchNotesAfterUpdate(): Promise<void> {
    const db = getDatabase()
    if (db.isUserViewLastestPatchnote || db.lastPatchNoteCheckVersion !== appVer) {
        return
    }

    try {
        const release = await getPatchNoteRelease(appVer)
        await openPatchNotesModal({
            version: appVer,
            initialRelease: release,
        })
    } catch (error) {
        console.warn('Failed to load the latest patch notes', error)
    }
}
