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
 * Manages concurrent asset save operations with a queue.
 *
 * Responsibilities:
 * - Limits concurrent save operations to prevent memory exhaustion
 * - Tracks progress (completed/total)
 * - Detects completion and triggers callbacks
 * - Handles finalization when no more assets will be added
 */
class AssetSaveQueue {
    private queue: Array<{id: string, promise: Promise<void>}> = []
    private completed: Set<string> = new Set()
    private totalEnqueued: number = 0
    private totalCompleted: number = 0
    private isFinalized: boolean = false
    private completionResolver?: () => void

    constructor(
        private maxConcurrent: number,
        private onProgress?: (done: number, total: number) => void
    ) {}

    /**
     * Adds an asset save operation to the queue.
     * Waits for a free slot if queue is full.
     *
     * @param id - Unique identifier for this asset
     * @param saveFn - Async function that performs the save and returns the saved ID
     * @returns Promise that resolves to the saved asset ID
     */
    async enqueue(
        id: string,
        saveFn: () => Promise<string>
    ): Promise<string> {
        this.totalEnqueued++

        // Wait for a free slot if queue is full
        await this.waitForSlot()

        let resolvedId: string
        const promise = (async () => {
            try {
                resolvedId = await saveFn()
                this.totalCompleted++
                this.completed.add(id)

                // Notify progress
                this.onProgress?.(this.totalCompleted, this.totalEnqueued)

                // Check if all work is complete
                this.checkCompletion()
            } finally {
                // Remove self from queue
                this.queue = this.queue.filter(item => item.id !== id)
            }
        })()

        this.queue.push({ id, promise })
        await promise
        return resolvedId!
    }

    /**
     * Waits until a slot becomes available in the queue.
     */
    private async waitForSlot(): Promise<void> {
        while (this.queue.length >= this.maxConcurrent) {
            await Promise.race(this.queue.map(q => q.promise))
            // Clean up completed items
            this.queue = this.queue.filter(q => !this.completed.has(q.id))
        }
    }

    /**
     * Marks the queue as finalized (no more items will be added).
     * If all items are already complete, triggers completion immediately.
     */
    finalize(): void {
        this.isFinalized = true
        this.checkCompletion()
    }

    /**
     * Checks if all work is complete and triggers completion callback if so.
     */
    private checkCompletion(): void {
        if (this.isFinalized && this.totalCompleted >= this.totalEnqueued) {
            this.completionResolver?.()
        }
    }

    /**
     * Returns a promise that resolves when all queued work is complete.
     * Must call finalize() before awaiting this promise.
     */
    async awaitCompletion(): Promise<void> {
        return new Promise<void>((resolve) => {
            this.completionResolver = resolve
            // Check immediately in case already complete
            this.checkCompletion()
        })
    }

    /**
     * Returns current progress statistics.
     */
    getProgress() {
        return {
            done: this.totalCompleted,
            total: this.totalEnqueued,
            percentage: this.totalEnqueued > 0
                ? (this.totalCompleted / this.totalEnqueued * 100)
                : 0
        }
    }

    /**
     * Returns whether the queue has space for more work.
     */
    hasSpace(maxQueueSize: number): boolean {
        return this.queue.length < maxQueueSize
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

    // Asset save queue manager
    private saveQueue: AssetSaveQueue

    // Promise that resolves when all assets are saved
    private completionPromise?: Promise<void>

    // Results: filename -> saved asset ID mapping
    assets:{[key:string]:string} = {}

    // Temporary buffers for accumulating file chunks during streaming
    assetBuffers:{[key:string]:AppendableBuffer} = {}

    // Files excluded due to size limits (> MAX_ASSET_SIZE_BYTES)
    excludedFiles:string[] = []

    // Extracted character card JSON content
    cardData:string|undefined

    // Extracted module binary data
    moduleData:Uint8Array|undefined

    // Configuration
    alertInfo:boolean = false  // Show progress alerts to user
    skipSaving: boolean = false  // If true, only compute hashes without saving
    hashSignal: string|undefined  // Hash to signal server for sync (when skipSaving is false)

    constructor(){
        this.unzip = new fflate.Unzip()
        this.unzip.register(fflate.UnzipInflate)
        this.unzip.onfile = (file) => this.#handleFile(file)

        // Initialize queue with progress callback
        this.saveQueue = new AssetSaveQueue(
            MAX_CONCURRENT_ASSET_SAVES,
            (done, total) => {
                if(this.alertInfo){
                    alertStore.set({
                        type: 'progress',
                        msg: `Loading...`,
                        submsg: (done / total * 100).toFixed(2)
                    })
                }
            }
        )
    }

    /**
     * High-level method to parse ZIP data from various sources.
     *
     * Handles three input types:
     * - ReadableStream: Streams data chunks as they arrive
     * - Uint8Array: Splits into CHUNK_SIZE_BYTES chunks
     * - File: Reads in CHUNK_SIZE_BYTES chunks
     *
     * All data is fed through feedChunk() for processing.
     * Creates a completion promise that can be awaited with done().
     */
    async parse(data:Uint8Array|File|ReadableStream<Uint8Array>, arg:{
        alertInfo?:boolean
    } = {}){
        // Create completion promise at the start of parsing
        this.completionPromise = this.saveQueue.awaitCompletion()

        // Handle streaming data (e.g., from fetch response)
        if(data instanceof ReadableStream){
            const reader = data.getReader()
            while(true){
                const {done, value} = await reader.read()
                if(value){
                    await this.feedChunk(value, false)
                }
                if(done){
                    await this.feedChunk(new Uint8Array(0), true)
                    break
                }
            }
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
            await this.feedChunk(chunk, false)
            if(pointer + CHUNK_SIZE_BYTES >= getLength()){
                await this.feedChunk(new Uint8Array(0), true)
                break
            }
            pointer += CHUNK_SIZE_BYTES
        }
        await sleep(QUEUE_WAIT_INTERVAL_MS)
    }


    /**
     * Feeds a chunk of ZIP data to the streaming parser.
     *
     * Large chunks (> CHUNK_SIZE_BYTES) are automatically split to prevent blocking.
     * When final=true, marks input as complete and finalizes the save queue.
     */
    async feedChunk(data:Uint8Array, final:boolean = false){
        // Split large chunks to prevent blocking
        if(data.byteLength > CHUNK_SIZE_BYTES){
            let pointer = 0
            while(true){
                const chunk = data.slice(pointer, pointer + CHUNK_SIZE_BYTES)
                await this.#waitForQueue()
                this.unzip.push(chunk, false)
                if(pointer + CHUNK_SIZE_BYTES >= data.byteLength){
                    if(final){
                        this.unzip.push(new Uint8Array(0), final)
                        await this.#finalize()
                    }
                    break
                }
                pointer += CHUNK_SIZE_BYTES
            }
            return
        }

        await this.#waitForQueue()
        this.unzip.push(data, final)

        if(final){
            await this.#finalize()
        }
    }

    /**
     * Returns a promise that resolves when all assets have been processed.
     * Must be called after parse() has been invoked.
     */
    async done(){
        if (!this.completionPromise) {
            throw new Error('parse() must be called before done()')
        }
        return this.completionPromise
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
     * Queues an asset for saving with concurrency control.
     * Delegates to AssetSaveQueue for all queue management.
     */
    async #processAssetQueue(asset:{id:string, data:Uint8Array}){
        // Queue the asset save operation
        const assetSaveId = await this.saveQueue.enqueue(
            asset.id,
            async () => {
                // Either save to storage or just compute hash
                if(this.skipSaving){
                    return `assets/${await hasher(asset.data)}.png`
                } else {
                    return await saveAsset(asset.data)
                }
            }
        )

        // Store the result
        this.assets[asset.id] = assetSaveId
    }

    /**
     * Waits until the queue has space available.
     * Prevents overwhelming the system with too many concurrent operations.
     */
    async #waitForQueue(){
        while(!this.saveQueue.hasSpace(MAX_QUEUE_SIZE)){
            await sleep(QUEUE_WAIT_INTERVAL_MS)
        }
    }

    /**
     * Finalizes processing when all ZIP data has been pushed.
     * Saves hash signal if needed and marks the queue as complete.
     */
    async #finalize(){
        // Save hash signal for server sync if needed
        if(this.hashSignal){
            await saveAsset(new TextEncoder().encode(this.hashSignal))
        }

        // Mark queue as finalized (no more assets will be added)
        this.saveQueue.finalize()
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