import localforage from "localforage";
import { v4 } from "uuid";
import { getDatabase, setDatabase, type InlayAssetMeta } from "../../storage/database.svelte";
import { checkImageType, encodeCanvasToImage } from "../../util/imageConvert";
import { getModelInfo, LLMFlags } from "src/ts/model/modellist";
import { asBuffer } from "../../util";
import { saveAsset } from "../../globalApi.svelte";

export type InlayAsset = {
    data: string | Blob,
    ext: string
    height: number
    name: string,
    type: 'image' | 'video' | 'audio'
    width: number
}

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

async function registerInlayMeta(id:string, meta:InlayAssetMeta){
    const db = ensureInlayAssets(getDatabase())
    db.inlayAssets[id] = meta
    setDatabase(db)
    return meta
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

// Returns with base64 data URI
export async function getInlayAsset(id: string){
    const img = await inlayStorage.getItem<InlayAsset | null>(id)
    if(img === null){
        return null
    }

    let data: string;
    if(img.data instanceof Blob){
        data = await blobToBase64(img.data)
    } else {
        data = img.data as string
    }

    return { ...img, data }
}

// Returns with Blob
export async function getInlayAssetBlob(id: string){
    const img = await inlayStorage.getItem<InlayAsset | null>(id)
    if(img === null){
        return null
    }

    let data: Blob;
    if(typeof img.data === 'string'){
        // Migrate to Blob
        data = base64ToBlob(img.data)
        setInlayAsset(id, { ...img, data })
    } else {
        data = img.data
    }

    return { ...img, data }
}

export async function listInlayAssets(): Promise<[id: string, InlayAsset][]> {
    const assets: [id: string, InlayAsset][] = []
    await inlayStorage.iterate<InlayAsset, void>((value, key) => {
        assets.push([key, value])
    })

    return assets
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

export async function removeInlayAsset(id: string){
    await inlayStorage.removeItem(id)
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
