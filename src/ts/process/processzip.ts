import { AppendableBuffer, saveAsset, type LocalWriter, type VirtualWriter } from "../globalApi.svelte";
import * as fflate from "fflate";
import { asBuffer, sleep } from "../util";
import { alertStore } from "../alert";
import { hasher } from "../parser.svelte";
import { hubURL } from "../characterCards";

// File size and chunk size constants
const MAX_ASSET_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const CHUNK_SIZE_BYTES = 1024 * 1024; // 1MB

// Queue management constants
const MAX_CONCURRENT_ASSET_SAVES = 10;
const MAX_QUEUE_SIZE = 30;

// Timing constants
const QUEUE_WAIT_INTERVAL_MS = 100;

// HTTP status code ranges
const HTTP_STATUS_OK_MIN = 200;
const HTTP_STATUS_OK_MAX = 300;

export async function processZip(dataArray: Uint8Array): Promise<string> {
    const unzipped = await new Promise<fflate.Unzipped>((resolve, reject) => {
        fflate.unzip(dataArray, (err, data) => {
            if (err) reject(err);
            else resolve(data);
        });
    });

    const imageFile = Object.keys(unzipped).find(fileName => /\.(jpg|jpeg|png)$/i.test(fileName));
    if (imageFile) {
        const imageData = unzipped[imageFile];
        const blob = new Blob([asBuffer(imageData)], { type: 'image/png' });
        const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                resolve(result);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        return base64;
    } else {
        throw new Error("No image found in ZIP file");
    }
}

export class CharXWriter{
    zip:fflate.Zip
    writeEnd:boolean = false
    apb = new AppendableBuffer()
    #takenFilenames:Set<string> = new Set()
    constructor(private writer:LocalWriter|WritableStreamDefaultWriter<Uint8Array>|VirtualWriter){
        const handlerAsync = (err:Error, dat:Uint8Array, final:boolean) => {
            if(dat){
                this.apb.append(dat)
            }
            if(final){
                this.writeEnd = true
            }
        }

        this.zip = new fflate.Zip()
        this.zip.ondata = handlerAsync
    }
    async init(){
        //do nothing, just to make compatible with other writer
    }

    async writeJpeg(img: Uint8Array){
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        if(!ctx){
            return
        }
        const imgBlob = new Blob([asBuffer(img)], {type: 'image/jpeg'})
        const imgURL = URL.createObjectURL(imgBlob)
        const imgElement = document.createElement('img')
        imgElement.src = imgURL
        await imgElement.decode()
        canvas.width = imgElement.width
        canvas.height = imgElement.height
        ctx.drawImage(imgElement, 0, 0)
        const blob = await (new Promise((res:BlobCallback, rej) => {
            canvas.toBlob(res, 'image/jpeg')
        }))
        const buf = await blob.arrayBuffer()
        this.apb.append(new Uint8Array(buf))
    }

    async write(key:string,data:Uint8Array|string, level?:0|1|2|3|4|5|6|7|8|9){
        key = this.#sanitizeZipFilename(key)
        let dat:Uint8Array
        if(typeof data === 'string'){
            dat = new TextEncoder().encode(data)
        }
        else{
            dat = data
        }
        this.writeEnd = false
        const file = new fflate.ZipDeflate(key, {
            level: level ?? 0
        });
        this.zip.add(file)
        file.push(dat, true)
        await this.writer.write(this.apb.buffer)
        this.apb.clear()
        if(this.writeEnd){
            await this.writer.close()
        }
        
    }

    #sanitizeZipFilename(filename:string) {
        let sanitized = filename.replace(/[<>:"\\|?*\x00-\x1F]/g, '_');
        sanitized = sanitized.replace(/[. ]+$/, '');
        const reservedNames = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;
        if (reservedNames.test(sanitized)) {
            sanitized = '_' + sanitized;
        }
        if (!sanitized || sanitized === '.' || sanitized === '..') {
            sanitized = 'file_' + Date.now();
        }

        const splitName = sanitized.split('.');
        let baseName = splitName.slice(0, -1).join('.');
        const extension = splitName.length > 1 ? '.' + splitName[splitName.length - 1] : '';
        let counter = 1;
        let uniqueName = baseName + extension;
        while (this.#takenFilenames.has(uniqueName)) {
            uniqueName = `${baseName}_${counter}${extension}`;
            counter++;
        }
        
        this.#takenFilenames.add(uniqueName);
        return uniqueName;
    }

    async end(){
        this.zip.end()
        await this.writer.write(this.apb.buffer)
        this.apb.clear()
        if(this.writeEnd){
            await this.writer.close()
        }
    }
}

export class CharXReader{
    unzip:fflate.Unzip
    assets:{[key:string]:string} = {}
    assetBuffers:{[key:string]:AppendableBuffer} = {}
    assetSavePromises:{
        id: string,
        promise: Promise<void>
    }[] = []
    assetQueueDone:Set<string> = new Set()
    excludedFiles:string[] = []
    cardData:string|undefined
    moduleData:Uint8Array|undefined
    allPushed:boolean = false
    fullPromiseResolver:() => void = () => {}
    alertInfo:boolean = false
    assetQueueLength:number = 0
    doneAssets:number = 0
    onQueue: number = 0
    expectedAssets:number = 0
    hashSignal: string|undefined
    skipSaving: boolean = false
    constructor(){
        this.unzip = new fflate.Unzip()
        this.unzip.register(fflate.UnzipInflate)
        this.unzip.onfile = (file) => {
            const assetIndex = file.name
            this.assetBuffers[assetIndex] = new AppendableBuffer()

            file.ondata = (err, dat, final) => {
                this.assetBuffers[assetIndex].append(dat)
                if(final){
                    const assetData = this.assetBuffers[assetIndex].buffer
                    if(assetData.byteLength > MAX_ASSET_SIZE_BYTES){
                        this.excludedFiles.push(assetIndex)
                    }
                    else if(file.name === 'card.json'){
                        this.cardData = new TextDecoder().decode(assetData)
                    }
                    else if(file.name === 'module.risum'){
                        this.moduleData = assetData
                    }
                    else if(file.name.endsWith('.json')){
                        //do nothing
                    }
                    else{
                        this.#processAssetQueue({
                            id: assetIndex,
                            data: assetData
                        })
                    }
                    delete this.assetBuffers[assetIndex]
                }
            }

            if(file.originalSize ?? 0 < MAX_ASSET_SIZE_BYTES){
                file.start()
            }
        }
    }

    async makePromise(){
        return new Promise<void>((res, rej) => {
            this.fullPromiseResolver = res
        })
    }

    async #processAssetQueue(asset:{id:string, data:Uint8Array}){
        this.assetQueueLength++
        this.onQueue++
        console.log('[CharX] processAssetQueue:', {
            assetId: asset.id,
            queueLength: this.assetQueueLength,
            doneAssets: this.doneAssets,
            onQueue: this.onQueue,
            promiseCount: this.assetSavePromises.length
        })
        if(this.alertInfo){
            alertStore.set({
                type: 'progress',
                msg: `Loading...`,
                submsg: (this.doneAssets / this.assetQueueLength * 100).toFixed(2)
            })
        }
        if(this.assetSavePromises.length >= MAX_CONCURRENT_ASSET_SAVES){
            console.log(`[CharX] Waiting for promises (>=${MAX_CONCURRENT_ASSET_SAVES})...`)
            await Promise.any(this.assetSavePromises.map(a => a.promise))
        }
        this.assetSavePromises = this.assetSavePromises.filter(a => !this.assetQueueDone.has(a.id))
        this.onQueue--
        if(this.assetSavePromises.length > MAX_CONCURRENT_ASSET_SAVES){
            this.assetQueueLength--
            console.log('[CharX] ⚠️ RECURSION! queueLength decreased to:', this.assetQueueLength)
            return this.#processAssetQueue(asset)
        }
        const savePromise = (async () => {
            const assetSaveId = this.skipSaving ? `assets/${await hasher(asset.data)}.png` : (await saveAsset(asset.data))
            this.assets[asset.id] = assetSaveId

            this.doneAssets++
            this.assetQueueDone.add(asset.id)
            console.log('[CharX] Asset saved:', {
                assetId: asset.id,
                doneAssets: this.doneAssets,
                queueLength: this.assetQueueLength,
                progress: (this.doneAssets / this.assetQueueLength * 100).toFixed(2) + '%'
            })
            if(this.alertInfo){
                alertStore.set({
                    type: 'progress',
                    msg: `Loading...`,
                    submsg: (this.doneAssets / this.assetQueueLength * 100).toFixed(2)
                })
            }


            if(this.allPushed && this.doneAssets >= this.assetQueueLength){
                console.log('[CharX] ✓ All assets processed! Resolving promise...', {
                    allPushed: this.allPushed,
                    doneAssets: this.doneAssets,
                    queueLength: this.assetQueueLength
                })
                if(this.hashSignal){
                    const signalId = await saveAsset(new TextEncoder().encode(this.hashSignal ?? ""))
                }
                this.fullPromiseResolver?.()
            } else {
                console.log('[CharX] Not done yet:', {
                    allPushed: this.allPushed,
                    doneAssets: this.doneAssets,
                    queueLength: this.assetQueueLength,
                    condition: `${this.doneAssets} >= ${this.assetQueueLength} = ${this.doneAssets >= this.assetQueueLength}`
                })
            }
        })()
        this.assetSavePromises.push({
            id: asset.id,
            promise: savePromise
        })
    }

    async waitForQueue(){

        while(this.assetSavePromises.length + this.onQueue >= MAX_QUEUE_SIZE){
            await sleep(QUEUE_WAIT_INTERVAL_MS)
        }
    }

    async push(data:Uint8Array, final:boolean = false){

        if(data.byteLength > CHUNK_SIZE_BYTES){
            let pointer = 0
            while(true){
                const chunk = data.slice(pointer, pointer + CHUNK_SIZE_BYTES)
                await this.waitForQueue()
                this.unzip.push(chunk, false)
                if(pointer + CHUNK_SIZE_BYTES >= data.byteLength){
                    if(final){
                        this.unzip.push(new Uint8Array(0), final)
                        this.allPushed = final
                    }
                    break
                }
                pointer += CHUNK_SIZE_BYTES
            }
            return
        }

        await this.waitForQueue()
        this.unzip.push(data, final)
        this.allPushed = final
        if(final){
            console.log('[CharX] All data pushed! allPushed=true')
            // Check if assets are already done (race condition fix)
            if(this.doneAssets >= this.assetQueueLength){
                console.log('[CharX] ✓ Assets already completed! Resolving promise...', {
                    doneAssets: this.doneAssets,
                    queueLength: this.assetQueueLength
                })
                if(this.hashSignal){
                    const signalId = await saveAsset(new TextEncoder().encode(this.hashSignal ?? ""))
                }
                this.fullPromiseResolver?.()
            }
        }
    }

    async read(data:Uint8Array|File|ReadableStream<Uint8Array>, arg:{
        alertInfo?:boolean
    } = {}){

        if(data instanceof ReadableStream){
            const reader = data.getReader()
            while(true){
                const {done, value} = await reader.read()
                if(value){
                    await this.push(value, false)
                }
                if(done){
                    await this.push(new Uint8Array(0), true)
                    break
                }
            }
            await this.push(new Uint8Array(0), true)
            return
        }

        const getSlice = async (start:number, end:number) => {
            if(data instanceof Uint8Array){
                return data.slice(start, end)
            }
            if(data instanceof File){
                return new Uint8Array(await data.slice(start, end).arrayBuffer())
            }
        }

        const getLength = () => {
            if(data instanceof Uint8Array){
                return data.byteLength
            }
            if(data instanceof File){
                return data.size
            }
        }

        let pointer = 0
        while(true){
            const chunk = await getSlice(pointer, pointer + CHUNK_SIZE_BYTES)
            await this.push(chunk, false)
            if(pointer + CHUNK_SIZE_BYTES >= getLength()){
                await this.push(new Uint8Array(0), true)
                break
            }
            pointer += CHUNK_SIZE_BYTES
        }
        await sleep(QUEUE_WAIT_INTERVAL_MS)
    }
}


export async function CharXSkippableChecker(data:Uint8Array){
    const hashed = await hasher(data)
    const reHashed = await hasher(new TextEncoder().encode(hashed))
    const x = await fetch(hubURL + '/rs/assets/' + reHashed + '.png')
    return {
        success: x.status >= HTTP_STATUS_OK_MIN && x.status < HTTP_STATUS_OK_MAX,
        hash: hashed
    }
}