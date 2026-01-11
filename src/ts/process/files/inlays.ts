import localforage from "localforage";
import { v4 } from "uuid";
import { getDatabase, setDatabase, type InlayAssetMeta } from "../../storage/database.svelte";
import { checkImageType, encodeCanvasToImage, mimeFromExt } from "../../util/imageConvert";
import { getModelInfo, LLMFlags } from "src/ts/model/modellist";
import { asBuffer } from "../../util";
import { loadAsset, removeAsset, saveAsset } from "../../globalApi.svelte";
import { extractInlayIdsFromMessages } from "../../util/inlayTokens";

const inlayImageExts = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'
]

const inlayAudioExts = [
    'wav', 'mp3', 'ogg', 'flac'
]

const inlayVideoExts = [
    'webm', 'mp4', 'mkv'
]

const inlayStorage = localforage.createInstance({
    name: 'inlay',
    storeName: 'inlay'
})

type InlayAssetType = 'image'|'video'|'audio'

type LegacyInlayAsset = {
    name: string
    data: string | Blob
    ext: string
    height: number
    width: number
    type: InlayAssetType
}

function normalizeExt(ext?:string){
    return (ext ?? '').toLowerCase()
}

function getInlayTypeFromExt(ext:string):InlayAssetType|null{
    const lowered = normalizeExt(ext)
    if(inlayImageExts.includes(lowered)){
        return 'image'
    }
    if(inlayAudioExts.includes(lowered)){
        return 'audio'
    }
    if(inlayVideoExts.includes(lowered)){
        return 'video'
    }
    return null
}

function ensureInlayAssets(db = getDatabase()){
    db.inlayAssets ??= {}
    return db
}

function getInlayMeta(id:string, db = getDatabase()){
    return db.inlayAssets?.[id] ?? null
}

async function registerInlayMeta(id:string, meta:InlayAssetMeta){
    const db = ensureInlayAssets(getDatabase())
    db.inlayAssets[id] = meta
    setDatabase(db)
    return meta
}

function resolveInlayPath(id:string, meta:InlayAssetMeta){
    if(meta?.path){
        return meta.path
    }
    return `assets/${id}.${meta.ext ?? 'png'}`
}

function getInlayMimeType(ext:string, type:InlayAssetType){
    if(type === 'image'){
        return mimeFromExt(ext)
    }
    const lowered = normalizeExt(ext)
    if(type === 'audio'){
        if(lowered === 'mp3'){
            return 'audio/mpeg'
        }
        return `audio/${lowered || 'mpeg'}`
    }
    if(type === 'video'){
        if(lowered === 'mkv'){
            return 'video/x-matroska'
        }
        return `video/${lowered || 'mp4'}`
    }
    return 'application/octet-stream'
}

async function dataToUint8Array(data: string | Blob | Uint8Array){
    if(data instanceof Uint8Array){
        return data
    }
    if(data instanceof Blob){
        return new Uint8Array(await data.arrayBuffer())
    }
    if(typeof data === 'string'){
        if(data.startsWith('data:')){
            const blob = base64ToBlob(data)
            return new Uint8Array(await blob.arrayBuffer())
        }
        return new Uint8Array(Buffer.from(data, 'base64'))
    }
    return new Uint8Array()
}

async function getImageDimensions(data: Uint8Array, mime: string){
    if(typeof Image === 'undefined'){
        return { width: 0, height: 0 }
    }
    const blob = new Blob([asBuffer(data)], { type: mime })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    try{
        await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve()
            img.onerror = () => reject(new Error('Failed to read inlay image dimensions.'))
            img.src = url
        })
    }
    finally{
        URL.revokeObjectURL(url)
    }
    return { width: img.width, height: img.height }
}

async function migrateLegacyInlay(id:string, legacy:LegacyInlayAsset){
    const ext = normalizeExt(legacy.ext) || 'png'
    const name = legacy.name || id
    const type = legacy.type ?? getInlayTypeFromExt(ext) ?? 'image'
    const bytes = await dataToUint8Array(legacy.data)
    const fileBase = name.replace(/\.[^/.]+$/, '')
    const path = await saveAsset(bytes, id, `${fileBase}.${ext}`)
    const meta:InlayAssetMeta = {
        path,
        ext,
        type,
        width: legacy.width ?? 0,
        height: legacy.height ?? 0,
        name
    }
    await registerInlayMeta(id, meta)
    await inlayStorage.removeItem(id)
    return meta
}

export async function postInlayAsset(img:{
    name:string,
    data:Uint8Array
}){

    const extention = normalizeExt(img.name.split('.').at(-1))
    const imgObj = new Image()

    if(inlayImageExts.includes(extention)){
        imgObj.src = URL.createObjectURL(new Blob([asBuffer(img.data)], {type: `image/${extention}`}))

        return await writeInlayImage(imgObj, {
            name: img.name,
            ext: extention
        })
    }

    if(inlayAudioExts.includes(extention) || inlayVideoExts.includes(extention)){
        const type = getInlayTypeFromExt(extention)
        if(!type){
            return null
        }
        const imgid = v4()
        await setInlayAsset(imgid, {
            name: img.name,
            data: img.data,
            ext: extention,
            type,
            height: 0,
            width: 0
        })
        return `${imgid}`
    }

    return null
}

export async function writeInlayImage(imgObj:HTMLImageElement, arg:{name?:string, ext?:string, id?:string} = {}) {

    let drawHeight = 0
    let drawWidth = 0
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if(!ctx){
        throw new Error('Canvas context unavailable for inlay image.')
    }
    await new Promise<void>((resolve, reject) => {
        const handleLoad = () => {
            drawHeight = imgObj.height
            drawWidth = imgObj.width

            //resize image to fit inlay, if total pixels exceed 1024*1024
            const maxPixels = 1024 * 1024
            const currentPixels = drawHeight * drawWidth
            
            if(currentPixels > maxPixels){
                const scaleFactor = Math.sqrt(maxPixels / currentPixels)
                drawWidth = Math.floor(drawWidth * scaleFactor)
                drawHeight = Math.floor(drawHeight * scaleFactor)
            }

            canvas.width = drawWidth
            canvas.height = drawHeight
            ctx.drawImage(imgObj, 0, 0, drawWidth, drawHeight)
            resolve()
        }

        const handleError = () => {
            reject(new Error('Failed to load inlay image.'))
        }

        if(imgObj.complete && imgObj.naturalWidth > 0){
            handleLoad()
            return
        }

        imgObj.onload = handleLoad
        imgObj.onerror = handleError
    })
    const encoded = await encodeCanvasToImage(canvas, {
        preferWebp: true,
        fallback: 'jpeg'
    })

    const imgid = arg.id ?? v4()
    const name = arg.name ?? imgid
    const baseName = name.replace(/\.[^/.]+$/, '')
    const path = await saveAsset(encoded.data, imgid, `${baseName}.${encoded.ext}`)
    await registerInlayMeta(imgid, {
        path,
        ext: encoded.ext,
        type: 'image',
        width: drawWidth,
        height: drawHeight,
        name
    })

    return `${imgid}`
}

function base64ToBlob(b64: string): Blob {
    const splitDataURI = b64.split(',');
    const byteString = atob(splitDataURI[1]);
    const mimeString = splitDataURI[0].split(':')[1].split(';')[0];

    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }

    return new Blob([ab], { type: mimeString });
}

function blobToBase64(blob: Blob): Promise<string> {
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    return new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
            resolve(reader.result as string);
        };
        reader.onerror = reject;
    });
}

async function getInlayAssetFromPath(path: string){
    const ext = normalizeExt(path.split('.').at(-1)) || 'png'
    const type = getInlayTypeFromExt(ext) ?? 'image'
    const bytes = await loadAsset(path)
    if(!bytes){
        return null
    }
    const mime = getInlayMimeType(ext, type)
    let width = 0
    let height = 0
    if(type === 'image'){
        const dims = await getImageDimensions(bytes, mime)
        width = dims.width
        height = dims.height
    }
    const data = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
    return {
        name: path,
        data,
        ext,
        width,
        height,
        type
    }
}

async function getInlayAssetBlobFromPath(path: string){
    const ext = normalizeExt(path.split('.').at(-1)) || 'png'
    const type = getInlayTypeFromExt(ext) ?? 'image'
    const bytes = await loadAsset(path)
    if(!bytes){
        return null
    }
    const mime = getInlayMimeType(ext, type)
    let width = 0
    let height = 0
    if(type === 'image'){
        const dims = await getImageDimensions(bytes, mime)
        width = dims.width
        height = dims.height
    }
    const data = new Blob([asBuffer(bytes)], { type: mime })
    return {
        name: path,
        data,
        ext,
        width,
        height,
        type
    }
}

// Returns with base64 data URI
export async function getInlayAsset(id: string){
    if(id.startsWith('assets/')){
        return await getInlayAssetFromPath(id)
    }

    let meta = getInlayMeta(id)
    if(!meta){
        const legacy = await inlayStorage.getItem(id) as LegacyInlayAsset | null
        if(legacy){
            try{
                meta = await migrateLegacyInlay(id, legacy)
            }
            catch (error){
                let data = legacy.data instanceof Blob ? await blobToBase64(legacy.data) : legacy.data
                return { ...legacy, data }
            }
        }
    }
    if(!meta){
        return null
    }

    const path = resolveInlayPath(id, meta)
    const bytes = await loadAsset(path)
    if(!bytes){
        const legacy = await inlayStorage.getItem(id) as LegacyInlayAsset | null
        if(legacy){
            let data = legacy.data instanceof Blob ? await blobToBase64(legacy.data) : legacy.data
            return { ...legacy, data }
        }
        return null
    }

    const mime = getInlayMimeType(meta.ext, meta.type)
    let width = meta.width ?? 0
    let height = meta.height ?? 0
    if(meta.type === 'image' && (!width || !height)){
        const dims = await getImageDimensions(bytes, mime)
        width = dims.width
        height = dims.height
        if(width && height){
            await registerInlayMeta(id, { ...meta, width, height })
        }
    }
    const data = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`
    return {
        name: meta.name ?? id,
        data,
        ext: meta.ext,
        width,
        height,
        type: meta.type
    }
}

// Returns with Blob
export async function getInlayAssetBlob(id: string){
    if(id.startsWith('assets/')){
        return await getInlayAssetBlobFromPath(id)
    }

    let meta = getInlayMeta(id)
    if(!meta){
        const legacy = await inlayStorage.getItem(id) as LegacyInlayAsset | null
        if(legacy){
            try{
                meta = await migrateLegacyInlay(id, legacy)
            }
            catch (error){
                let data: Blob
                if(typeof legacy.data === 'string'){
                    data = base64ToBlob(legacy.data)
                    await setLegacyInlayAsset(id, { ...legacy, data })
                } else {
                    data = legacy.data
                }
                return { ...legacy, data }
            }
        }
    }
    if(!meta){
        return null
    }

    const path = resolveInlayPath(id, meta)
    const bytes = await loadAsset(path)
    if(!bytes){
        const legacy = await inlayStorage.getItem(id) as LegacyInlayAsset | null
        if(legacy){
            let data: Blob
            if(typeof legacy.data === 'string'){
                data = base64ToBlob(legacy.data)
                await setLegacyInlayAsset(id, { ...legacy, data })
            } else {
                data = legacy.data
            }
            return { ...legacy, data }
        }
        return null
    }

    const mime = getInlayMimeType(meta.ext, meta.type)
    const data = new Blob([asBuffer(bytes)], { type: mime })
    let width = meta.width ?? 0
    let height = meta.height ?? 0
    if(meta.type === 'image' && (!width || !height)){
        const dims = await getImageDimensions(bytes, mime)
        width = dims.width
        height = dims.height
        if(width && height){
            await registerInlayMeta(id, { ...meta, width, height })
        }
    }
    return {
        name: meta.name ?? id,
        data,
        ext: meta.ext,
        width,
        height,
        type: meta.type
    }
}

async function setLegacyInlayAsset(id: string, img: LegacyInlayAsset){
    await inlayStorage.setItem(id, img)
}

export async function setInlayAsset(id: string, img:{
    name: string,
    data: string | Blob | Uint8Array,
    ext: string,
    height: number,
    width: number,
    type: InlayAssetType
}){
    const ext = normalizeExt(img.ext) || 'png'
    const type = img.type ?? getInlayTypeFromExt(ext) ?? 'image'
    const bytes = await dataToUint8Array(img.data)
    const baseName = (img.name || id).replace(/\.[^/.]+$/, '')
    const path = await saveAsset(bytes, id, `${baseName}.${ext}`)
    await registerInlayMeta(id, {
        path,
        ext,
        type,
        width: img.width ?? 0,
        height: img.height ?? 0,
        name: img.name ?? id
    })
}

export function supportsInlayImage(){
    const db = getDatabase()
    return getModelInfo(db.aiModel).flags.includes(LLMFlags.hasImageInput)
}

export async function reencodeImage(img:Uint8Array){
    if(checkImageType(img) === 'PNG'){
        return img
    }
    const canvas = document.createElement('canvas')
    const imgObj = new Image()
    imgObj.src = URL.createObjectURL(new Blob([asBuffer(img)], {type: `image/png`}))
    await imgObj.decode()
    let drawHeight = imgObj.height
    let drawWidth = imgObj.width
    canvas.width = drawWidth
    canvas.height = drawHeight
    const ctx = canvas.getContext('2d')
    ctx.drawImage(imgObj, 0, 0, drawWidth, drawHeight)
    const b64 = canvas.toDataURL('image/png').split(',')[1]
    const b = Buffer.from(b64, 'base64')
    return b
}

function collectInlayIdsFromDatabase(db = getDatabase()){
    const ids = new Set<string>()
    for(const char of db.characters ?? []){
        for(const chat of char.chats ?? []){
            const chatIds = extractInlayIdsFromMessages(chat.message ?? [])
            for(const id of chatIds){
                ids.add(id)
            }
        }
    }
    return ids
}

export async function removeOrphanInlayAssets(candidateIds: Iterable<string>, db = getDatabase()){
    const candidates = new Set(candidateIds)
    if(candidates.size === 0){
        return
    }
    const referenced = collectInlayIdsFromDatabase(db)
    let changed = false
    for(const id of candidates){
        if(referenced.has(id)){
            continue
        }
        const meta = db.inlayAssets?.[id]
        if(meta){
            const path = resolveInlayPath(id, meta)
            await removeAsset(path)
            delete db.inlayAssets[id]
            changed = true
        }
        else if(id.startsWith('assets/')){
            await removeAsset(id)
        }
        await inlayStorage.removeItem(id)
    }
    if(changed){
        setDatabase(db)
    }
}

export async function removeInlayAssetsForMessages(messages: Array<{ data: string }>, db = getDatabase()){
    const ids = extractInlayIdsFromMessages(messages)
    if(ids.size === 0){
        return
    }
    await removeOrphanInlayAssets(ids, db)
}
