import { getDatabase, saveImage, setDatabase } from "./storage/database.svelte"
import { selectSingleFile, sleep } from "./util"
import { alertError, alertNormal, alertStore } from "./alert"
import { AppendableBuffer, downloadFile, readImage } from "./globalApi.svelte"
import { language } from "src/lang"
import { reencodeImage } from "./process/files/inlays"
import { PngChunk } from "./pngChunk"
import { v4 } from "uuid"
import { DBState } from "./stores.svelte"

export async function selectUserImg() {
    const selected = await selectSingleFile(['png'])
    if (!selected) {
        return
    }
    const img = selected.data
    const imgp = await saveImage(img)
    DBState.db.userIcon = imgp
    DBState.db.personas[DBState.db.selectedPersona] = {
        ...DBState.db.personas[DBState.db.selectedPersona],
        name: DBState.db.username,
        icon: DBState.db.userIcon,
        personaPrompt: DBState.db.personaPrompt,
        note: DBState.db.userNote,
        id: v4()
    }
}

export function saveUserPersona() {
    DBState.db.personas[DBState.db.selectedPersona].name = DBState.db.username
    DBState.db.personas[DBState.db.selectedPersona].icon = DBState.db.userIcon
    DBState.db.personas[DBState.db.selectedPersona].personaPrompt = DBState.db.personaPrompt
    DBState.db.personas[DBState.db.selectedPersona].note = DBState.db.userNote
}

export function changeUserPersona(id: number, save: 'save' | 'noSave' = 'save') {
    if (save === 'save') {
        saveUserPersona()
    }
    const pr = DBState.db.personas[id]
    DBState.db.personaPrompt = pr.personaPrompt
    DBState.db.username = pr.name
    DBState.db.userIcon = pr.icon
    DBState.db.userNote = pr.note
    DBState.db.selectedPersona = id
}

interface PersonaCard {
    name: string
    personaPrompt: string
    note?: string
}

export async function exportUserPersona() {
    let db = getDatabase({ snapshot: true })
    if ((!db.username) || (!db.personaPrompt)) {
        alertError("username or persona prompt is empty")
        return
    }

    let img: Uint8Array
    if (!db.userIcon) {
        const canvas = document.createElement('canvas')
        canvas.width = 256
        canvas.height = 256
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = 'rgb(100, 116, 139)'
        ctx.fillRect(0, 0, 256, 256)
        const dataUrl = canvas.toDataURL('image/png')
        const base64 = dataUrl.split(',')[1]
        img = new Uint8Array(Buffer.from(base64, 'base64'))
    } else {
        img = await readImage(db.userIcon)
    }

    let card: PersonaCard = safeStructuredClone({
        name: db.username,
        personaPrompt: db.personaPrompt,
        note: db.userNote,
    })

    alertStore.set({
        type: 'wait',
        msg: 'Loading... (Writing Exif)'
    })

    await sleep(10)

    img = (await PngChunk.write(await reencodeImage(img), {
        "persona": Buffer.from(JSON.stringify(card)).toString('base64')
    })) as Uint8Array

    alertStore.set({
        type: 'wait',
        msg: 'Loading... (Writing)'
    })

    await sleep(10)
    await downloadFile(`${db.username.replace(/[<>:"/\\|?*\.\,]/g, "")}_export.png`, img)

    alertNormal(language.successExport)
}

export async function importUserPersona() {
    try {
        const v = await selectSingleFile(['png'])
        if (!v) {
            return
        }
        const readGenerator = PngChunk.readGenerator(v.data)
        let decoded: string | undefined;

        for await (const chunk of readGenerator) {
            if (chunk && !(chunk instanceof AppendableBuffer) && chunk.key === 'persona') {
                decoded = chunk.value
                break
            }
        }

        if (!decoded) {
            alertError(language.errors.noData)
            return
        }
        const data: PersonaCard = JSON.parse(Buffer.from(decoded, 'base64').toString('utf-8'))
        if (data.name && data.personaPrompt) {
            DBState.db.personas.push({
                name: data.name,
                icon: await saveImage(await reencodeImage(v.data)),
                personaPrompt: data.personaPrompt,
                note: data.note,
                id: v4()
            })
            alertNormal(language.successImport)
        } else {
            alertError(language.errors.noData)
        }
    } catch (error) {
        alertError(error)
        return
    }
}