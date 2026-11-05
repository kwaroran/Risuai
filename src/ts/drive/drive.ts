import { alertConfirm, alertError, alertInput, alertNormal, alertSelect, alertStore } from "../alert";
import { getDatabase, type Database } from "../storage/database.svelte";
import { forageStorage, getUncleanables, openURL } from "../globalApi.svelte";
import { isTauri } from "src/ts/platform"
import { BaseDirectory, exists, readFile, readDir, writeFile } from "@tauri-apps/plugin-fs";
import { language } from "../../lang";
import { relaunch } from '@tauri-apps/plugin-process';
import { sleep } from "../util";
import { hubURL } from "../characterCards";
import { decodeRisuSave, encodeRisuSave } from "../storage/risuSave";
import { saveKV, saveKVSourceFromData, type SaveKVData } from "../storage/saveKV";
import { collectColdStorageBackupPayloads, confirmIncompleteColdStorageOperation, getColdStorageBackupName, getColdStorageItem, isValidColdStorageItem, listColdDataKeysFromDb, listPluginStorageColdKeys, pluginStorage, setColdStorageItem } from "../process/coldstorage.svelte";

const driveStateKey = 'risuDriveState'

export async function checkDriver(type:'save'|'load'|'loadtauri'|'savetauri'|'reftoken'){
    const CLIENT_ID = '580075990041-l26k2d3c0nemmqiu3d3aag01npfrkn76.apps.googleusercontent.com';
    const REDIRECT_URI = type === 'reftoken' ? 'https://sv.risuai.xyz/drive' : "https://risuai.xyz/"
    const SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
    const encodedRedirectUri = encodeURIComponent(REDIRECT_URI);
    let state:string = type
    if(type === 'save' || type === 'load'){
        state = `${type}.${crypto.randomUUID()}`
        sessionStorage.setItem(driveStateKey, state)
    }
    const authorizationUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodedRedirectUri}&scope=${SCOPE}&response_type=code&state=${encodeURIComponent(state)}`;


    if(type === 'reftoken'){
        const authorizationUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${CLIENT_ID}&redirect_uri=${encodedRedirectUri}&scope=${SCOPE}&response_type=code&state=${"accesstauri"}&access_type=offline&prompt=consent`;
        return authorizationUrl
    }

    if(type === 'save' || type === 'load'){
        location.href = (authorizationUrl);
    }
    else{
        
        try {
            if(isTauri){
                openURL(authorizationUrl)
            }
            else{
                window.open(authorizationUrl)
            }
            let code = await alertInput(language.pasteAuthCode)
            if(code.includes(' ')){
                code = code.substring(code.lastIndexOf(' ')).trim()
            }
            if(type === 'loadtauri'){
                await loadDrive(code, 'backup')
            }
            else{
                await backupDrive(code)
            }
        } catch (error) {
            console.error(error)
            alertError(`Backup Error: ${error}`)
        }
    }
}


export async function checkDriverInit() {
    try {
        const loc = new URLSearchParams(location.search)
        const code = loc.get('code')

        if(code){
            const state = loc.get('state') ?? ''
            const action = state.split('.')[0]
            if(action === 'save' || action === 'load'){
                const expectedState = sessionStorage.getItem(driveStateKey)
                sessionStorage.removeItem(driveStateKey)
                const currentURL = new URL(location.href)
                currentURL.search = ''
                window.history.replaceState({}, "", currentURL.href)
                if(!expectedState || state !== expectedState){
                    alertError(language.driveAuthInvalid)
                    return false
                }
            }
            const res = await fetch(hubURL + `/drive/token?code=${encodeURIComponent(code)}`)
            if(res.status >= 200 && res.status < 300){
                const json:{
                    access_token:string,
                    expires_in:number
                } = await res.json()
                //after a failed backup or restore the URL is already cleared,
                //so return false and let the app finish loading for the user to rerun it
                if(action === 'save'){
                    if(await alertConfirm(language.backupConfirm)){
                        if(!await backupDrive(json.access_token)){
                            return false
                        }
                    }
                }
                else if(action === 'load'){
                    if(await loadDrive(json.access_token, 'backup') === 'failed'){
                        return false
                    }
                }
                else if(state === 'savetauri' || state === 'loadtauri'){
                    alertStore.set({
                        type: 'wait2',
                        msg: `Copy and paste this Auth Code: ${json.access_token}`
                    })
                }
                else if(state === 'accesstauri'){
                    alertStore.set({
                        type: 'wait2',
                        msg: JSON.stringify(json)
                    })
                }
            }
            else{
                alertError(await res.text())
                // location.search = ''
            }
            return true
        }
        else{
            return false
        }   
    } catch (error) {
        console.error(error)
        alertError(`Backup Error: ${error}`)
        const currentURL = new URL(location.href)
        currentURL.search = ''
        window.history.replaceState( {} , "", currentURL.href );
        await sleep(100000)
        return false
    }
}

let lastSaved:number = parseInt(localStorage.getItem('risu_lastsaved') ?? '-1')
let BackupDb:Database = null


export function syncDrive() {
    BackupDb = safeStructuredClone(getDatabase())
    return
}


/** Returns false if the backup failed; the error is already shown to the user. */
async function backupDrive(ACCESS_TOKEN:string):Promise<boolean> {
    try {
        await backupDriveData(ACCESS_TOKEN)
        return true
    } catch (error) {
        console.error(error)
        if(error instanceof DriveAuthError){
            alertError(language.driveTokenExpiredBackup)
        }
        else{
            alertError(language.driveBackupInterrupted(error instanceof Error ? error.message : `${error}`))
        }
        return false
    }
}

async function backupDriveData(ACCESS_TOKEN:string) {
    alertStore.set({
        type: "wait",
        msg: "Uploading Backup..."
    })

    const files:DriveFile[] = await getFilesInFolder(ACCESS_TOKEN)

    const fileNames = files.map((d) => {
        return d.name
    })

    const coldStoragePayloads = await collectColdStorageBackupPayloads(getDatabase())
    const unavailableColdStorageKeys = [...coldStoragePayloads.missingKeys, ...coldStoragePayloads.invalidKeys]
    if(!await confirmIncompleteColdStorageOperation(getDatabase(), unavailableColdStorageKeys, 'backup')){
        return
    }

    if(isTauri){
        const assets = await readDir('assets', {baseDir: BaseDirectory.AppData})
        let i = 0;
        for(let asset of assets){
            i += 1;
            alertStore.set({
                type: "wait",
                msg: `Uploading Backup... (${i} / ${assets.length})`
            })
            const key = asset.name
            if(!key || !key.endsWith('.png')){
                continue
            }
            const formatedKey = newFormatKeys(key)
            if(!fileNames.includes(formatedKey)){
                await createFileInFolder(ACCESS_TOKEN, formatedKey, await readFile('assets/' + asset.name, {baseDir: BaseDirectory.AppData}))
            }
        }
    }
    else{
        const keys = await forageStorage.keys()

        for(let i=0;i<keys.length;i++){
            alertStore.set({
                type: "wait",
                msg: `Uploading Backup... (${i} / ${keys.length})`
            })
            const key = keys[i]
            if(!key.endsWith('.png')){
                continue
            }
            const formatedKey = newFormatKeys(key)
            if(!fileNames.includes(formatedKey)){
                await createFileInFolder(ACCESS_TOKEN, formatedKey, await forageStorage.getItem(key) as unknown as Uint8Array)
            }
        }
    }

    for(let i=0;i<coldStoragePayloads.payloads.length;i++){
        const payload = coldStoragePayloads.payloads[i]
        alertStore.set({
            type: "wait",
            msg: `Uploading Cold Storage... (${i + 1} / ${coldStoragePayloads.payloads.length})`
        })
        //cold storage items never change under the same key, so existing uploads can be skipped
        if(fileNames.includes(payload.backupName)){
            continue
        }
        await createFileInFolder(ACCESS_TOKEN, payload.backupName, payload.encoded)
    }

    const dbData = await encodeRisuSave(getDatabase(), { compression: true, kv: saveKV })

    alertStore.set({
        type: "wait",
        msg: `Uploading Backup... (Saving database)`
    })

    await createFileInFolder(ACCESS_TOKEN, `${(Date.now() / 1000).toFixed(0)}-database.risudat`, dbData)


    alertNormal('Success')
}

type DriveFile = {
    mimeType:string
    name:string
    id: string
}

async function loadDrive(ACCESS_TOKEN:string, mode: 'backup'|'sync'):Promise<void|"noSync"|"failed"> {
    if(mode === 'sync'){
        return await loadDriveData(ACCESS_TOKEN, mode)
    }
    try {
        return await loadDriveData(ACCESS_TOKEN, mode)
    } catch (error) {
        if(error instanceof DriveAuthError){
            console.error(error)
            alertError(language.driveTokenExpiredRestore)
            return 'failed'
        }
        throw error
    }
}

async function loadDriveData(ACCESS_TOKEN:string, mode: 'backup'|'sync'):Promise<void|"noSync"> {
    if(mode === 'backup'){
        alertStore.set({
            type: "wait",
            msg: "Loading Backup..."
        })
    }
    const files:DriveFile[] = await getFilesInFolder(ACCESS_TOKEN)
    let foragekeys:string[] = []
    let loadedForageKeys = false
    let db = getDatabase()

    async function checkImageExists(images:string) {
        if(db?.account?.useSync){
            return false
        }
        if(isTauri){
            return await exists(`assets/` + images, {baseDir: BaseDirectory.AppData})
        }
        else{
            if(!loadedForageKeys){
                foragekeys = await forageStorage.keys()
                loadedForageKeys = true
            }
            return foragekeys.includes('assets/' + images)
        }
    }
    const fileNames = files.map((d) => {
        return d.name
    })


    let dbs:[DriveFile,number][] = []
    let noSyncData = true

    if(mode === 'backup'){
        for(const f of files){
            if(f.name.endsWith("-database.risudat")){
                const tm = parseInt(f.name.split('-')[0])
                if(isNaN(tm)){
                    continue
                }
                else{
                    dbs.push([f,tm])
                }
            }
        }
        dbs.sort((a,b) => {
            return b[1] - a[1]
        })
    }
    else if(mode === 'sync'){
        for(const f of files){
            if(f.name.endsWith("-database.risudat2")){
                const tm = parseInt(f.name.split('-')[0])
                if(isNaN(tm)){
                    continue
                }
                else{
                    if(tm > lastSaved){
                        dbs.push([f,tm])
                    }
                    noSyncData = false
                }
            }
        }
        dbs.sort((a,b) => {
            return b[1] - a[1]
        })
    }

    if(noSyncData && mode === 'sync'){
        return 'noSync'
    }

    if(dbs.length !== 0){
        if(mode === 'sync'){
            alertStore.set({
                type: "wait",
                msg: "Sync Data..."
            })
        }
        async function getDbFromList(): Promise<{ database: Database, kv: SaveKVData }>{
            let selectables:string[] = []
            for(let i=0;i<dbs.length;i++){
                selectables.push(`Backup saved in ${(new Date(dbs[i][1] * 1000)).toLocaleString()}`)
                if(selectables.length > 7){
                    break
                }
            }
            const selectedIndex = (await alertSelect([language.loadLatest, language.loadOthers]) === '0') ? 0 : parseInt(await alertSelect(selectables))
            const selectedDb = dbs[selectedIndex][0]
            return await decodeRisuSave(await getFileData(ACCESS_TOKEN, selectedDb.id))
        }
    
        //sync data is plain JSON and carries no SaveKV data
        const { database: db, kv }: { database: Database, kv: SaveKVData } = mode === 'backup'
            ? await getDbFromList()
            : { database: JSON.parse(Buffer.from(await getFileData(ACCESS_TOKEN, dbs[0][0].id)).toString('utf-8')), kv: {} }
        const coldStorageRestoreFailures = await restoreColdStorageFromDrive(ACCESS_TOKEN, files, db, mode)
        if(coldStorageRestoreFailures.length > 0){
            if(mode === 'sync'){
                alertError(`Sync failed. ${coldStorageRestoreFailures.length} cold storage item(s) could not be restored.`)
                return
            }
            if(!await confirmIncompleteColdStorageOperation(db, coldStorageRestoreFailures, 'restore')){
                return
            }
        }
        const requiredImages = (await getUncleanables(db))
        let ind = 0;
        let errorLogs:string[] = []
        for(const images of requiredImages){
            ind += 1
            for(let tries=0;tries<3;tries++){
                const formatedImage = tries === 0 ? newFormatKeys(images) : formatKeys(images)
                if(mode === 'sync'){
                    alertStore.set({
                        type: "wait",
                        msg: `Sync Files... (${ind} / ${requiredImages.length})`
                    })
                }
                else{
                    alertStore.set({
                        type: "wait",
                        msg: `Loading Backup... (${ind} / ${requiredImages.length})`
                    })
                }
                if(await checkImageExists(images)){
                    //skip process
                }
                else{
                    if(formatedImage.length >= 7){
                        if(fileNames.includes(formatedImage)){
                            for(const file of files){
                                if(file.name === formatedImage){
                                    const fData = await getFileData(ACCESS_TOKEN, file.id)
                                    if(isTauri){
                                        await writeFile(`assets/` + images, fData ,{baseDir: BaseDirectory.AppData})
        
                                    }
                                    else{
                                        await forageStorage.setItem('assets/' + images, fData)
                                    }
                                    tries = 3
                                }
                            }
                        }
                        else{
                            alertStore.set({
                                type: "wait",
                                msg: `Loading Backup... (${ind} / ${requiredImages.length}) (Error in ${formatedImage})`
                            })
                            await sleep(1000)
                        }
                    }
                }
            }
        }
        db.didFirstSetup = true
        //a restored backup brings its own SaveKV data; sync data has none, so this device's data is kept
        const dbData = await encodeRisuSave(db, { compression: true, kv: mode === 'sync' ? saveKV : saveKVSourceFromData(kv) })

        if(isTauri){
            await writeFile('database/database.bin', dbData, {baseDir: BaseDirectory.AppData})
            lastSaved = Date.now()
            localStorage.setItem('risu_lastsaved', `${lastSaved}`)
            relaunch()
            alertStore.set({
                type: "wait",
                msg: "Success, Refreshing your app."
            })
        }
        else{
            await forageStorage.setItem('database/database.bin', dbData)
            lastSaved = Date.now()
            localStorage.setItem('risu_lastsaved', `${lastSaved}`)
            location.search = ''
            alertStore.set({
                type: "wait",
                msg: "Success, Refreshing your app."
            })
        }
    }
    else if(mode === 'backup'){
        location.search = ''
    }
}

async function restoreColdStorageFromDrive(
    ACCESS_TOKEN:string,
    files:DriveFile[],
    db:Database,
    mode:'backup'|'sync'
) {
    const failures:string[] = []
    const restored = new Set<string>()
    const legacyPluginStorageKeys = new Set(listPluginStorageColdKeys(db))

    const restoreKeys = async (keys:string[], pluginStorageKeys:Set<string>) => {
        for(let i=0;i<keys.length;i++){
            const key = keys[i]
            if(restored.has(key)){
                continue
            }
            restored.add(key)
            //a cold storage key is never rewritten with other data, so an item already on this
            //device is the same one; skipping it lets a rerun after an interrupted restore continue.
            //null still downloads, since a missing item also reads as null
            const existing = await getColdStorageItem(key)
            if(existing !== null && isValidColdStorageItem(existing, pluginStorageKeys.has(key))){
                continue
            }
            const names = new Set([
                getColdStorageBackupName(key),
                `coldstorage/${key}.json`,
                `${key}.json`
            ])
            const file = files.find((driveFile) => names.has(driveFile.name))
            if(!file){
                console.warn(`Cold storage data not found in Drive backup: ${key}`)
                failures.push(key)
                continue
            }
            alertStore.set({
                type: "wait",
                msg: `${mode === 'sync' ? 'Sync' : 'Loading Backup'} Cold Storage... (${i + 1} / ${keys.length})`
            })
            try {
                const jsonData = JSON.parse(new TextDecoder().decode(await getFileData(ACCESS_TOKEN, file.id)))
                if(isValidColdStorageItem(jsonData, pluginStorageKeys.has(key))){
                    if(!await setColdStorageItem(key, jsonData)){
                        failures.push(key)
                    }
                }
                else{
                    console.warn(`Skipping invalid cold storage Drive item ${file.name}`)
                    failures.push(key)
                }
            } catch (error) {
                if(error instanceof DriveAuthError){
                    throw error
                }
                console.error(`Failed to restore cold storage item ${key}:`, error)
                failures.push(key)
            }
        }
    }

    //first pass: character/chat data, legacy plugin storage items and the plugin storage index
    const indexPointer = db.pluginCustomStorage?._coldpluginIndex
    const firstPassPluginKeys = new Set(legacyPluginStorageKeys)
    if(typeof indexPointer === 'string'){
        firstPassPluginKeys.add(indexPointer)
    }
    await restoreKeys(listColdDataKeysFromDb(db), firstPassPluginKeys)

    //second pass: large plugin storage values, listed inside the (now restored) index
    const pluginStorageKeys = new Set(await pluginStorage.referencedIds(db.pluginCustomStorage))
    await restoreKeys(Array.from(pluginStorageKeys), pluginStorageKeys)

    return failures
}

function checkImageExist(image:string){

}


function formatKeys(name:string) {
    return getBasename(name).replace(/\_/g, '__').replace(/\./g,'_d').replace(/\//,'_s') + '.png'
}

function newFormatKeys(name:string) {
    let n = getBasename(name)
    const bf = Buffer.from(n).toString('hex')
    return n + '.bin'
}

/** Thrown when Google rejects the access token, usually because it expired. */
class DriveAuthError extends Error {
    constructor(message = 'Google Drive access token expired') {
        super(message)
        this.name = 'DriveAuthError'
    }
}

class DriveRequestError extends Error {
    constructor(readonly status:number, message:string) {
        super(message)
        this.name = 'DriveRequestError'
    }
}

function retryDelay(attempt:number) {
    return Math.min(32000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 1000)
}

/**
 * Whether a failed response is worth retrying. 429 and rate limit 403 mean
 * Google turned the request away; a 5xx may come after the request took
 * effect, so it is only retried when the request is safe to repeat.
 */
async function isRetryableResponse(response:Response, repeatable:boolean) {
    if(response.status === 429){
        return true
    }
    if(response.status >= 500){
        return repeatable
    }
    if(response.status === 403){
        const text = await response.clone().text().catch(() => '')
        //reason is userRateLimitExceeded or rateLimitExceeded, message "User rate limit exceeded."
        return /rate ?limit ?exceeded/i.test(text)
    }
    return false
}

async function driveRequestError(response:Response) {
    const text = await response.text().catch(() => '')
    let message = text
    try {
        message = JSON.parse(text)?.error?.message ?? text
    } catch {
        //not JSON, keep the raw text
    }
    return new DriveRequestError(response.status, `Google Drive request failed (${response.status}): ${message}`)
}

/**
 * fetch for the Drive API. Retries rate limits with exponential backoff, and
 * also network errors and server errors when the request is repeatable.
 * Throws DriveAuthError on 401.
 *
 * Set repeatable to false for requests that must not run twice, like
 * creating a file: a network error or 5xx there may come after Drive already
 * created it, and sending it again would make a second copy.
 */
async function driveFetch(
    ACCESS_TOKEN:string,
    url:string,
    init:Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
    { retries = 4, repeatable = true }: { retries?: number, repeatable?: boolean } = {}
): Promise<Response> {
    for(let attempt = 0;; attempt++){
        let response: Response
        try {
            response = await fetch(url, {
                ...init,
                headers: {
                    Authorization: `Bearer ${ACCESS_TOKEN}`,
                    ...init.headers,
                },
            })
        } catch (error) {
            if(!repeatable || attempt >= retries){
                throw error
            }
            console.warn(`Drive request failed, retrying (${attempt + 1} / ${retries}):`, error)
            await sleep(retryDelay(attempt))
            continue
        }
        if(response.ok){
            return response
        }
        if(response.status === 401){
            throw new DriveAuthError()
        }
        if(attempt < retries && await isRetryableResponse(response, repeatable)){
            console.warn(`Drive request returned ${response.status}, retrying (${attempt + 1} / ${retries})`)
            await sleep(retryDelay(attempt))
            continue
        }
        throw await driveRequestError(response)
    }
}

async function getFilesInFolder(ACCESS_TOKEN:string): Promise<DriveFile[]> {
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType)')
    const files: DriveFile[] = []
    let pageToken = ''
    do {
        const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&pageSize=1000&fields=${fields}`
            + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '')
        const data = await (await driveFetch(ACCESS_TOKEN, url)).json()
        files.push(...(data.files as DriveFile[] ?? []))
        pageToken = data.nextPageToken ?? ''
    } while(pageToken)
    return files
}

async function createFileInFolder(accessToken:string, fileName:string, content:Uint8Array, mimeType = 'application/octet-stream') {
    const metadata = {
      name: fileName,
      mimeType: mimeType,
      parents: ["appDataFolder"],
    };

    const body = new FormData();
    body.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" })
    );
    body.append("file", new Blob([content as any], { type: mimeType }));

    const response = await driveFetch(
      accessToken,
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        body: body,
      },
      //an interrupted upload may still have created the file; a rerun of the
      //backup skips files that already exist, so fail instead of uploading again
      { repeatable: false }
    );

    return await response.json() as { id: string };
}
  
const baseNameRegex = /\\/g
function getBasename(data:string){
    const splited = data.replace(baseNameRegex, '/').split('/')
    const lasts = splited[splited.length-1]
    return lasts
}

async function getFileData(ACCESS_TOKEN:string,fileId:string) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const response = await driveFetch(ACCESS_TOKEN, url)
    return new Uint8Array(await response.arrayBuffer());
}
