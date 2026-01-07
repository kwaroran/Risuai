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

/**
 * Streaming reader for CharX (character export) files.
 *
 * CharX files are ZIP archives containing:
 * - card.json: Character card data (CCv3 format)
 * - module.risum: Optional module data (scripts, lorebook)
 * - assets/*: Image and other asset files
 *
 * This class processes ZIP streams incrementally to handle large files efficiently,
 * with concurrent asset saving limited to prevent memory exhaustion.
 */
export class CharXReader{
    // ZIP streaming parser
    unzip:fflate.Unzip

    // Results: filename -> saved asset ID mapping
    assets:{[key:string]:string} = {}

    // Temporary buffers for accumulating file chunks during streaming
    assetBuffers:{[key:string]:AppendableBuffer} = {}

    // Concurrent asset save operations (limited to MAX_CONCURRENT_ASSET_SAVES)
    assetSavePromises:{
        id: string,
        promise: Promise<void>
    }[] = []

    // Track completed assets to filter out finished promises
    assetQueueDone:Set<string> = new Set()

    // Files excluded due to size limits (> MAX_ASSET_SIZE_BYTES)
    excludedFiles:string[] = []

    // Extracted character card JSON content
    cardData:string|undefined

    // Extracted module binary data
    moduleData:Uint8Array|undefined

    // Flags for completion tracking
    allPushed:boolean = false  // All input data has been pushed
    fullPromiseResolver:() => void = () => {}  // Resolves when all processing is complete

    // Configuration
    alertInfo:boolean = false  // Show progress alerts to user
    skipSaving: boolean = false  // If true, only compute hashes without saving
    hashSignal: string|undefined  // Hash to signal server for sync (when skipSaving is false)

    // Queue counters
    assetQueueLength:number = 0  // Total assets discovered
    doneAssets:number = 0  // Assets saved so far
    onQueue: number = 0  // Assets currently being queued
    expectedAssets:number = 0  // Reserved for future use

    constructor(){
        this.unzip = new fflate.Unzip()
        this.unzip.register(fflate.UnzipInflate)
        this.unzip.onfile = (file) => this.#handleFile(file)
    }

    /**
     * Called when a new file is discovered in the ZIP archive.
     * Sets up streaming handlers and starts processing if file size is acceptable.
     */
    #handleFile(file: fflate.UnzipFile) {
        const assetIndex = file.name
        this.assetBuffers[assetIndex] = new AppendableBuffer()

        file.ondata = (_err, dat, final) => this.#handleFileData(assetIndex, dat, final)

        // Only process files smaller than MAX_ASSET_SIZE_BYTES (50MB)
        if(file.originalSize ?? 0 < MAX_ASSET_SIZE_BYTES){
            file.start()
        }
    }

    /**
     * Called for each chunk of file data as it streams in.
     * Accumulates chunks into buffer until file is complete.
     */
    #handleFileData(fileName: string, data: Uint8Array, final: boolean) {
        this.assetBuffers[fileName].append(data)
        if(final){
            this.#handleFileComplete(fileName)
        }
    }

    /**
     * Called when a file has been completely read from the ZIP.
     * Routes files to appropriate handlers based on filename/extension.
     */
    #handleFileComplete(fileName: string) {
        const assetData = this.assetBuffers[fileName].buffer

        if(assetData.byteLength > MAX_ASSET_SIZE_BYTES){
            this.excludedFiles.push(fileName)
        }
        else if(fileName === 'card.json'){
            this.cardData = new TextDecoder().decode(assetData)
        }
        else if(fileName === 'module.risum'){
            this.moduleData = assetData
        }
        else if(fileName.endsWith('.json')){
            // Ignore other JSON files
        }
        else{
            // All other files are treated as assets (images, etc.)
            this.#processAssetQueue({
                id: fileName,
                data: assetData
            })
        }

        delete this.assetBuffers[fileName]
    }

    /**
     * Creates a promise that resolves when all assets have been processed.
     * Call this before starting to read, then await it after reading is complete.
     */
    async makePromise(){
        return new Promise<void>((res, rej) => {
            this.fullPromiseResolver = res
        })
    }

    /**
     * Queues an asset for saving with concurrency control.
     *
     * This method:
     * 1. Limits concurrent saves to MAX_CONCURRENT_ASSET_SAVES (10)
     * 2. Updates progress if alertInfo is enabled
     * 3. Saves asset (or only computes hash if skipSaving is true)
     * 4. Checks if all processing is complete and resolves promise if so
     *
     * Recursively retries if queue is still full after cleanup.
     */
    async #processAssetQueue(asset:{id:string, data:Uint8Array}){
        this.assetQueueLength++
        this.onQueue++

        // Update progress UI
        if(this.alertInfo){
            alertStore.set({
                type: 'progress',
                msg: `Loading...`,
                submsg: (this.doneAssets / this.assetQueueLength * 100).toFixed(2)
            })
        }

        // Wait for at least one slot to free up if queue is full
        if(this.assetSavePromises.length >= MAX_CONCURRENT_ASSET_SAVES){
            await Promise.any(this.assetSavePromises.map(a => a.promise))
        }

        // Remove completed promises from queue
        this.assetSavePromises = this.assetSavePromises.filter(a => !this.assetQueueDone.has(a.id))
        this.onQueue--

        // If still full after cleanup, retry recursively
        if(this.assetSavePromises.length > MAX_CONCURRENT_ASSET_SAVES){
            this.assetQueueLength--
            return this.#processAssetQueue(asset)
        }

        // Start saving asset
        const savePromise = (async () => {
            // Either save to storage or just compute hash
            const assetSaveId = this.skipSaving
                ? `assets/${await hasher(asset.data)}.png`
                : (await saveAsset(asset.data))
            this.assets[asset.id] = assetSaveId

            this.doneAssets++
            this.assetQueueDone.add(asset.id)

            // Update progress UI
            if(this.alertInfo){
                alertStore.set({
                    type: 'progress',
                    msg: `Loading...`,
                    submsg: (this.doneAssets / this.assetQueueLength * 100).toFixed(2)
                })
            }

            // Check if all processing is complete
            if(this.allPushed && this.doneAssets >= this.assetQueueLength){
                // Save hash signal for server sync if needed
                if(this.hashSignal){
                    const signalId = await saveAsset(new TextEncoder().encode(this.hashSignal ?? ""))
                }
                this.fullPromiseResolver?.()
            }
        })()

        this.assetSavePromises.push({
            id: asset.id,
            promise: savePromise
        })
    }

    /**
     * Waits until the queue has space available.
     * Prevents overwhelming the system with too many concurrent operations.
     */
    async waitForQueue(){
        while(this.assetSavePromises.length + this.onQueue >= MAX_QUEUE_SIZE){
            await sleep(QUEUE_WAIT_INTERVAL_MS)
        }
    }

    /**
     * Pushes a chunk of ZIP data to the streaming parser.
     *
     * Large chunks (> CHUNK_SIZE_BYTES) are automatically split to prevent blocking.
     * When final=true, marks input as complete and resolves promise if all assets are done.
     *
     * Race condition handling: If all assets finish before final chunk arrives,
     * completion is triggered here instead of in #processAssetQueue.
     */
    async push(data:Uint8Array, final:boolean = false){
        // Split large chunks to prevent blocking
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
            // Race condition fix: Assets might have already finished processing
            if(this.doneAssets >= this.assetQueueLength){
                // Save hash signal for server sync if needed
                if(this.hashSignal){
                    const signalId = await saveAsset(new TextEncoder().encode(this.hashSignal ?? ""))
                }
                this.fullPromiseResolver?.()
            }
        }
    }

    /**
     * High-level method to read ZIP data from various sources.
     *
     * Handles three input types:
     * - ReadableStream: Streams data chunks as they arrive
     * - Uint8Array: Splits into CHUNK_SIZE_BYTES chunks
     * - File: Reads in CHUNK_SIZE_BYTES chunks
     *
     * All data is pushed through push() for processing.
     */
    async read(data:Uint8Array|File|ReadableStream<Uint8Array>, arg:{
        alertInfo?:boolean
    } = {}){
        // Handle streaming data (e.g., from fetch response)
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

        // Helper to get slice based on data type
        const getSlice = async (start:number, end:number) => {
            if(data instanceof Uint8Array){
                return data.slice(start, end)
            }
            if(data instanceof File){
                return new Uint8Array(await data.slice(start, end).arrayBuffer())
            }
        }

        // Helper to get total length
        const getLength = () => {
            if(data instanceof Uint8Array){
                return data.byteLength
            }
            if(data instanceof File){
                return data.size
            }
        }

        // Process in CHUNK_SIZE_BYTES chunks
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


/**
 * Checks if a CharX file's assets already exist on the server.
 *
 * This optimization allows skipping asset uploads when importing from the hub:
 * 1. Hashes the entire file
 * 2. Double-hashes the hash (for privacy/security)
 * 3. Checks if server has this hash registered
 *
 * If successful, the importer can skip saving assets and just reference server copies.
 *
 * @returns {success: boolean, hash: string} - Whether assets exist on server, and the file hash
 */
export async function CharXSkippableChecker(data:Uint8Array){
    const hashed = await hasher(data)
    const reHashed = await hasher(new TextEncoder().encode(hashed))
    const x = await fetch(hubURL + '/rs/assets/' + reHashed + '.png')
    return {
        success: x.status >= HTTP_STATUS_OK_MIN && x.status < HTTP_STATUS_OK_MAX,
        hash: hashed
    }
}