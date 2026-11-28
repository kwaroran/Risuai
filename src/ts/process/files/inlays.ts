import localforage from "localforage";
import { v4 } from "uuid";
import { getImageType } from "src/ts/media";
import { getDatabase, type InlayImageFormat, type InlayImageQuality } from "../../storage/database.svelte";
import { getModelInfo, LLMFlags, LLMFormat } from "src/ts/model/modellist";
import { asBuffer } from "../../util";
import {
    dataUriToUint8Array,
    extractMetadataFromBytes,
    extractStealthMetadataFromPixels,
    hasMetadata,
    injectMetadataIntoImage,
    type ExtractedImageMetadata,
} from "./inlayMetadata";

const INLAY_QUALITY_MAP: Record<InlayImageQuality, number> = {
    low: 0.75,
    balanced: 0.85,
    high: 0.92,
}

// NovelAI embeds stealth metadata in alpha LSBs, leaving opaque pixels at 254 or 255
const STEALTH_ALPHA_MIN = 254

export type InlayAsset = {
    /** Creation timestamp */
    created?: number
    data: string | Blob
    /** File extension */
    ext: string
    height?: number
    name: string
    type: 'image' | 'video' | 'audio' | 'signature'
    width?: number
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

export async function postInlayAsset(img: {
    name:string,
    data:Uint8Array
}) {
    const extension = img.name.split('.').at(-1)

    if(inlayImageExts.includes(extension)){
        const imgObj = new Image()
        imgObj.src = URL.createObjectURL(new Blob([asBuffer(img.data)], {type: `image/${extension}`}))

        return await writeInlayImage(imgObj, {
            name: img.name,
            ext: extension,
            sourceData: img.data
        })
    }

    const now = Date.now()

    if(inlayAudioExts.includes(extension)){
        const audioBlob = new Blob([asBuffer(img.data)], {type: `audio/${extension}`})
        const imgid = v4()

        await inlayStorage.setItem(imgid, {
            created: now,
            name: img.name,
            data: audioBlob,
            ext: extension,
            type: 'audio'
        })

        return `${imgid}`
    }

    if(inlayVideoExts.includes(extension)){
        const videoBlob = new Blob([asBuffer(img.data)], {type: `video/${extension}`})
        const imgid = v4()

        await inlayStorage.setItem(imgid, {
            created: now,
            name: img.name,
            data: videoBlob,
            ext: extension,
            type: 'video'
        })

        return `${imgid}`
    }

    return null
}

export async function writeInlayImage(
    imgObj:HTMLImageElement,
    arg:{name?:string, ext?:string, id?:string, sourceData?:Uint8Array | string} = {}
) {
    let drawHeight = 0
    let drawWidth = 0
    let wasResized = false
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    await new Promise((resolve) => {
        imgObj.onload = () => {
            drawHeight = imgObj.height
            drawWidth = imgObj.width

            // resize image to fit inlay, if total pixels exceed 1024*1024
            const maxPixels = 1024 * 1024
            const currentPixels = drawHeight * drawWidth
            
            if(currentPixels > maxPixels){
                const scaleFactor = Math.sqrt(maxPixels / currentPixels)
                drawWidth = Math.floor(drawWidth * scaleFactor)
                drawHeight = Math.floor(drawHeight * scaleFactor)
                wasResized = true
            }

            canvas.width = drawWidth
            canvas.height = drawHeight
            ctx.drawImage(imgObj, 0, 0, drawWidth, drawHeight)
            resolve(null)
        }
    })

    const db = getDatabase()
    const targetFormat: InlayImageFormat = db?.inlayImageFormat ?? 'png'
    const qualityPreset: InlayImageQuality = db?.inlayImageQuality ?? 'balanced'
    const quality = INLAY_QUALITY_MAP[qualityPreset] ?? 0.85
    const preserveMetadata = db?.inlayPreserveMetadata === true

    let metadata: ExtractedImageMetadata | null = null
    if(preserveMetadata){
        let sourceBytes: Uint8Array | null = null
        if(arg.sourceData instanceof Uint8Array){
            sourceBytes = arg.sourceData
        } else if(typeof arg.sourceData === 'string'){
            sourceBytes = dataUriToUint8Array(arg.sourceData)
        } else if(typeof imgObj.src === 'string'){
            sourceBytes = dataUriToUint8Array(imgObj.src)
        }
        if(sourceBytes){
            metadata = extractMetadataFromBytes(sourceBytes)
        }
    }

    let hasRealTransparency = false
    let hasStealthLikeAlpha = false

    const needsPixelInspection =
        targetFormat !== 'png' || (preserveMetadata && !wasResized && !hasMetadata(metadata))

    if(needsPixelInspection && typeof ctx?.getImageData === 'function' && drawWidth > 0 && drawHeight > 0){
        try {
            const imageData = ctx.getImageData(0, 0, drawWidth, drawHeight)
            const pixels = imageData.data
            for(let i = 3; i < pixels.length; i += 4){
                const a = pixels[i]
                if(a < STEALTH_ALPHA_MIN){
                    hasRealTransparency = true
                    break
                }
                if(a === STEALTH_ALPHA_MIN){
                    hasStealthLikeAlpha = true
                }
            }

            if(preserveMetadata && !wasResized && !hasMetadata(metadata) && hasStealthLikeAlpha){
                const stealth = extractStealthMetadataFromPixels(pixels, drawWidth, drawHeight)
                if(stealth){
                    metadata = { textChunks: stealth, rawPngChunks: [] }
                }
            }

            // Flatten NAI stealth-only alpha (254/255) to opaque 255 before lossy WebP encoding
            // so encoders do not waste an alpha plane or alter dark semi-transparent pixels.
            if(targetFormat === 'webp' && !hasRealTransparency && hasStealthLikeAlpha && typeof ctx.putImageData === 'function'){
                for(let i = 3; i < pixels.length; i += 4){
                    pixels[i] = 255
                }
                ctx.putImageData(imageData, 0, 0)
            }
        } catch {
            // Fall back cleanly if canvas pixel readback is unavailable
        }
    }

    const toBlob = (mime: string, q?: number) =>
        new Promise<Blob | null>((resolve) => {
            if(q === undefined){
                canvas.toBlob(resolve, mime)
            } else {
                canvas.toBlob(resolve, mime, q)
            }
        })

    let actualFormat: InlayImageFormat = 'png'
    let imageBlob: Blob | null = null

    if(targetFormat === 'webp'){
        const webpBlob = await toBlob('image/webp', quality)
        if(webpBlob && webpBlob.type === 'image/webp'){
            imageBlob = webpBlob
            actualFormat = 'webp'
        } else if(!hasRealTransparency){
            const jpegBlob = await toBlob('image/jpeg', quality)
            if(jpegBlob && jpegBlob.type === 'image/jpeg'){
                imageBlob = jpegBlob
                actualFormat = 'jpeg'
            }
        }
    } else if(targetFormat === 'jpeg' && !hasRealTransparency){
        const jpegBlob = await toBlob('image/jpeg', quality)
        if(jpegBlob && jpegBlob.type === 'image/jpeg'){
            imageBlob = jpegBlob
            actualFormat = 'jpeg'
        }
    }

    if(!imageBlob){
        imageBlob = await toBlob('image/png')
        actualFormat = 'png'
    }

    if(preserveMetadata && imageBlob && hasMetadata(metadata)){
        try {
            const encodedBytes = new Uint8Array(await imageBlob.arrayBuffer())
            const withMeta = injectMetadataIntoImage(
                encodedBytes,
                actualFormat,
                metadata,
                drawWidth,
                drawHeight,
            )
            if(withMeta !== encodedBytes){
                imageBlob = new Blob([asBuffer(withMeta)], { type: `image/${actualFormat}` })
            }
        } catch {
            // Keep the encoded image even if metadata injection fails
        }
    }

    const now = Date.now()
    const imgid = arg.id ?? v4()

    await inlayStorage.setItem(imgid, {
        created: now,
        name: arg.name ?? imgid,
        data: imageBlob,
        ext: actualFormat,
        height: drawHeight,
        width: drawWidth,
        type: 'image'
    })

    return `${imgid}`
}

export async function createInlayFromData(data: Uint8Array | string, name?: string) {
    if(typeof data === 'string'){
        //reject remote URLs so plugins can't bypass nativeFetch's URL restrictions
        if(!data.startsWith('data:')){
            throw new Error('String input must be an image data URI')
        }
        return await writeInlayImageFromSrc(data, name, data)
    }

    //mime is only a hint; undecodable bytes reject via onerror in writeInlayImageFromSrc
    const imageType = getImageType(data)
    const mimeType = imageType === 'Unknown' ? 'application/octet-stream' : `image/${imageType.toLowerCase()}`

    const src = URL.createObjectURL(new Blob([asBuffer(data)], {type: mimeType}))
    try {
        return await writeInlayImageFromSrc(src, name, data)
    } finally {
        URL.revokeObjectURL(src)
    }
}

function writeInlayImageFromSrc(src: string, name?: string, sourceData?: Uint8Array | string): Promise<string> {
    const imgObj = new Image()

    return new Promise((resolve, reject) => {
        //writeInlayImage only waits for onload; reject undecodable input via onerror
        imgObj.onerror = () => {
            reject(new Error('Failed to decode inlay image data'))
        }
        imgObj.src = src
        writeInlayImage(imgObj, { name, sourceData }).then(resolve, reject)
    })
}

export type InlaySignature = {
    signatures: {
        type: 'function'|'text'
        content: string
    }[],
    sourceFormat: LLMFormat,
    source: string
}

export async function saveInlayedSignature(sigid:string,signature:InlaySignature){
    await inlayStorage.setItem(sigid, {
        created: Date.now(),
        name: sigid,
        data: JSON.stringify(signature),
        ext: 'json',
        type: 'signature'
    } satisfies InlayAsset)
    return sigid
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

export async function setInlayAsset(id: string, img: InlayAsset){
    await inlayStorage.setItem(id, img)
}

export async function removeInlayAsset(id: string){
    await inlayStorage.removeItem(id)
}

export function supportsInlayImage(){
    const db = getDatabase()
    return getModelInfo(db.aiModel).flags.includes(LLMFlags.hasImageInput)
}

export async function reencodeImage(img:Uint8Array){
    if(getImageType(img) === 'PNG'){
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