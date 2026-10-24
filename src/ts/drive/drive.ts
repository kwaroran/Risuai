import { alertConfirm, alertError, alertInput, alertMd, alertNormal, alertSelect, alertStore } from "../alert";
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
import { collectColdStorageBackupPayloads, confirmIncompleteColdStorageOperation, getColdStorageBackupName, getColdStorageItem, isValidColdStorageItem, listColdDataKeysFromDb, listPluginStorageColdKeys, pluginStorage, setColdStorageItem, type ColdStorageBackupPayload } from "../process/coldstorage.svelte";
import {
    assetEntryName,
    coldEntryName,
    coveredEntries,
    databaseFileName,
    DRIVE_PACK_LIMIT,
    DRIVE_V2_VERSION,
    DrivePackSegmenter,
    EntryAssembler,
    manifestFileName,
    packFileName,
    parsePack,
    parseV2FileName,
    planFileName,
    type DrivePackRef,
    type DriveV2Manifest,
    type DriveV2Plan,
    type PackPiece,
    type PackPosition,
    type PackSegment,
} from "./drivePack";

const driveStateKey = 'risuDriveState'

//how many packs are uploaded or downloaded at the same time
const DRIVE_PARALLEL = 2

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
        await backupDriveV2(ACCESS_TOKEN)
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

/**
 * Uploads a v2 backup: every asset and cold storage item is written into
 * numbered pack files, then the database, then the manifest as the commit marker.
 * A session without a manifest is resumed from its last valid pack on the next run.
 */
async function backupDriveV2(ACCESS_TOKEN:string) {
    alertStore.set({
        type: "wait",
        msg: "Uploading Backup..."
    })

    const db = getDatabase()
    const coldStoragePayloads = await collectColdStorageBackupPayloads(db)
    const unavailableColdStorageKeys = [...coldStoragePayloads.missingKeys, ...coldStoragePayloads.invalidKeys]
    if(!await confirmIncompleteColdStorageOperation(db, unavailableColdStorageKeys, 'backup')){
        return
    }

    alertStore.set({
        type: "wait",
        msg: "Uploading Backup... (Checking previous backups)"
    })

    //snapshot the database first so the uploaded entries match what it references
    const dbData = await encodeRisuSave(db, { compression: true, kv: saveKV })
    const { sources, missing } = await collectBackupSources(db, coldStoragePayloads.payloads)
    const files = await getFilesInFolder(ACCESS_TOKEN)
    const filesByName = groupFilesByName(files)
    const sessions = scanV2Sessions(files)

    const completeIds = [...sessions.values()].filter((session) => session.manifests.length > 0).map((session) => session.id).sort(compareIds)
    const latestCompleteId = completeIds[completeIds.length - 1] ?? null
    let previous: DriveV2Manifest | null = null
    if(latestCompleteId){
        try {
            const manifest = await getJsonFile<DriveV2Manifest>(ACCESS_TOKEN, sessions.get(latestCompleteId).manifests[0])
            if(manifest?.version === DRIVE_V2_VERSION && manifest.entries){
                previous = manifest
            }
        } catch (error) {
            if(error instanceof DriveAuthError){
                throw error
            }
            console.warn('Could not read the previous backup manifest, uploading everything again:', error)
        }
    }

    const reusableRef = (name:string): { ref: DrivePackRef, packs: Record<string, number> } | null => {
        const ref = previous?.entries[name]
        if(ref){
            if('l' in ref){
                if(filesByName.has(ref.l)){
                    return { ref, packs: {} }
                }
            }
            else{
                const packs: Record<string, number> = {}
                let complete = true
                for(let seq = ref.s; seq <= ref.e; seq++){
                    const packName = packFileName(ref.b, seq)
                    const file = pickFile(filesByName, packName, previous.packs?.[packName])
                    if(!file){
                        complete = false
                        break
                    }
                    packs[packName] = Number(file.size)
                }
                if(complete){
                    return { ref, packs }
                }
            }
        }
        //files uploaded one by one by the v1 backup
        if(name.startsWith('a:')){
            const asset = name.slice(2)
            for(const legacyName of [newFormatKeys(asset), formatKeys(asset)]){
                if(legacyName.length >= 7 && filesByName.has(legacyName)){
                    return { ref: { l: legacyName }, packs: {} }
                }
            }
        }
        else if(name.startsWith('c:') && filesByName.has(name.slice(2))){
            //cold storage items never change under the same key
            return { ref: { l: name.slice(2) }, packs: {} }
        }
        return null
    }

    const resumed = await resumeV2Session(ACCESS_TOKEN, sessions, latestCompleteId, filesByName)
    const plan: DriveV2Plan = resumed?.plan ?? {
        version: DRIVE_V2_VERSION,
        id: Date.now().toString(),
        limit: DRIVE_PACK_LIMIT,
        entries: [],
        skipped: [],
    }
    let planFileId = resumed?.planFileId ?? null
    const position: PackPosition = resumed?.position ?? { entry: 0, offset: 0 }
    const nextSeq = resumed?.nextSeq ?? 1
    const entryPacks = resumed?.entryPacks ?? new Map<number, { s: number, e: number }>()
    const packSizes: Record<string, number> = resumed?.packSizes ?? {}
    const skipped = new Set(plan.skipped)
    let planChanged = !resumed

    const skipEntry = (index:number) => {
        skipped.add(index)
        plan.skipped = [...skipped].sort((a, b) => a - b)
        planChanged = true
    }

    //name -> index of the entry in this session that still counts
    const indexOf = new Map<string, number>()
    for(let i = 0; i < plan.entries.length; i++){
        if(skipped.has(i)){
            continue
        }
        const name = plan.entries[i]
        const done = i < position.entry
        if(!sources.has(name)){
            //no longer needed; finished entries just stay out of the manifest
            if(!done){
                skipEntry(i)
            }
            continue
        }
        if(done && !entryPacks.has(i)){
            skipEntry(i)
            continue
        }
        indexOf.set(name, i)
    }

    const reused = new Map<string, { ref: DrivePackRef, packs: Record<string, number> }>()
    for(const name of sources.keys()){
        if(indexOf.has(name)){
            continue
        }
        const reusable = reusableRef(name)
        if(reusable){
            reused.set(name, reusable)
            continue
        }
        indexOf.set(name, plan.entries.length)
        plan.entries.push(name)
        planChanged = true
    }
    const failed: string[] = []
    //gone from this device, but an earlier backup may still hold it
    for(const name of missing){
        const reusable = reusableRef(name)
        if(reusable){
            reused.set(name, reusable)
        }
        else{
            failed.push(name)
        }
    }

    const savePlan = async () => {
        const content = new TextEncoder().encode(JSON.stringify(plan))
        if(planFileId){
            await updateFileContent(ACCESS_TOKEN, planFileId, content, 'application/json')
        }
        else{
            planFileId = (await createFileInFolder(ACCESS_TOKEN, planFileName(plan.id), content, 'application/json')).id
        }
        planChanged = false
    }
    //the plan must list an entry before any pack that holds it is uploaded
    if(planChanged){
        await savePlan()
    }

    let total = 0
    for(let i = position.entry; i < plan.entries.length; i++){
        if(!skipped.has(i)){
            total += 1
        }
    }
    let packed = 0

    //packs are uploaded DRIVE_PARALLEL at a time. If one fails, a later one may
    //already be on Drive; resuming keeps only the unbroken chain from pack 1
    const uploads = new Set<Promise<void>>()
    let uploadError: unknown = null
    const waitUploads = async (max:number) => {
        while(uploads.size > (uploadError ? 0 : max)){
            await Promise.race(uploads)
        }
        if(uploadError){
            throw uploadError
        }
    }
    const uploadPack = async (segment:PackSegment) => {
        const name = packFileName(plan.id, segment.seq)
        await uploadLargeFile(ACCESS_TOKEN, name, segment.bytes, 'application/octet-stream', {
            rv: String(DRIVE_V2_VERSION),
            rb: plan.id,
            rs: String(segment.seq),
            rn: String(segment.bytes.byteLength),
            si: String(segment.start.entry),
            so: String(segment.start.offset),
            ei: String(segment.end.entry),
            eo: String(segment.end.offset),
        })
        packSizes[name] = segment.bytes.byteLength
        for(const index of segment.entries){
            markEntryPack(entryPacks, index, segment.seq)
        }
    }

    const segmenter = new DrivePackSegmenter(DRIVE_PACK_LIMIT, nextSeq, async (segment) => {
        await waitUploads(DRIVE_PARALLEL - 1)
        //entries skipped since the last save are listed before a pack can cover them
        if(planChanged){
            await savePlan()
        }
        alertStore.set({
            type: "wait",
            msg: `Uploading Backup... (${packed} / ${total}, pack ${segment.seq})`
        })
        const task: Promise<void> = uploadPack(segment).then(
            () => { uploads.delete(task) },
            (error) => {
                uploadError ??= error
                uploads.delete(task)
            }
        )
        uploads.add(task)
    })

    for(let index = position.entry; index < plan.entries.length; index++){
        if(skipped.has(index)){
            continue
        }
        const name = plan.entries[index]
        const from = index === position.entry ? position.offset : 0
        let data: Uint8Array | null = null
        try {
            data = await sources.get(name)?.() ?? null
        } catch (error) {
            console.error(`Failed to read ${name} for the backup:`, error)
        }
        if(!data || (from > 0 && from >= data.byteLength)){
            failed.push(name)
            indexOf.delete(name)
            skipEntry(index)
            continue
        }
        await segmenter.addEntry(index, name, data, from)
        packed += 1
    }
    await segmenter.finish()
    await waitUploads(0)

    const manifestEntries: Record<string, DrivePackRef> = {}
    const manifestPacks: Record<string, number> = {}
    for(const name of [...sources.keys(), ...missing]){
        const index = indexOf.get(name)
        if(index !== undefined){
            const range = entryPacks.get(index)
            if(!range){
                failed.push(name)
                continue
            }
            manifestEntries[name] = { b: plan.id, s: range.s, e: range.e }
            for(let seq = range.s; seq <= range.e; seq++){
                const packName = packFileName(plan.id, seq)
                manifestPacks[packName] = packSizes[packName]
            }
            continue
        }
        const reusable = reused.get(name)
        if(reusable){
            manifestEntries[name] = reusable.ref
            Object.assign(manifestPacks, reusable.packs)
        }
    }

    alertStore.set({
        type: "wait",
        msg: `Uploading Backup... (Saving database)`
    })

    const dbName = databaseFileName(plan.id)
    for(const file of filesByName.get(dbName) ?? []){
        await deleteFile(ACCESS_TOKEN, file.id)
    }
    await uploadLargeFile(ACCESS_TOKEN, dbName, dbData)

    const manifest: DriveV2Manifest = {
        version: DRIVE_V2_VERSION,
        id: plan.id,
        createdAt: Date.now(),
        database: dbName,
        entries: manifestEntries,
        packs: manifestPacks,
    }
    //uploaded last: a session counts as complete only once its manifest exists
    await uploadLargeFile(ACCESS_TOKEN, manifestFileName(plan.id), new TextEncoder().encode(JSON.stringify(manifest)), 'application/json')

    if(failed.length > 0){
        alertMd(language.driveBackupPartial(failed.map((name) => `- \`${name.slice(2)}\``).join('\n')))
    }
    else{
        alertNormal('Success')
    }
}

function formatFileList(names:string[], limit = 10) {
    const lines = names.slice(0, limit).map((name) => `- ${name}`)
    if(names.length > limit){
        lines.push(`- ... (+${names.length - limit})`)
    }
    return lines.join('\n')
}

type BackupSources = Map<string, () => Promise<Uint8Array | null>>

/**
 * Entries that can be read on this device, and the names of assets the
 * database references but this device no longer has.
 */
async function collectBackupSources(db:Database, coldPayloads:ColdStorageBackupPayload[]): Promise<{ sources: BackupSources, missing: string[] }> {
    const sources: BackupSources = new Map()
    const missing: string[] = []
    const required = await getUncleanables(db)
    let local: Set<string>
    if(isTauri){
        try {
            const assets = await readDir('assets', {baseDir: BaseDirectory.AppData})
            local = new Set(assets.map((asset) => asset.name).filter(Boolean))
        } catch (error) {
            console.warn('Could not list local assets:', error)
            local = new Set()
        }
    }
    else{
        local = new Set((await forageStorage.keys()).filter((key) => key.startsWith('assets/')).map((key) => key.slice('assets/'.length)))
    }

    //restore reads cold storage before assets, so it is packed first too
    for(const payload of coldPayloads){
        sources.set(coldEntryName(payload.backupName), async () => payload.encoded)
    }
    for(const name of required){
        if(!local.has(name)){
            console.warn(`Asset referenced by the database is missing on this device: ${name}`)
            missing.push(assetEntryName(name))
            continue
        }
        sources.set(assetEntryName(name), isTauri
            ? () => readFile('assets/' + name, {baseDir: BaseDirectory.AppData})
            : async () => await forageStorage.getItem('assets/' + name) as unknown as Uint8Array)
    }
    return { sources, missing: [...new Set(missing)] }
}

type DriveV2Session = {
    id: string
    plans: DriveFile[]
    manifests: DriveFile[]
    packs: Map<number, DriveFile[]>
}

function scanV2Sessions(files:DriveFile[]) {
    const sessions = new Map<string, DriveV2Session>()
    for(const file of files){
        const info = parseV2FileName(file.name)
        if(!info){
            continue
        }
        let session = sessions.get(info.id)
        if(!session){
            session = { id: info.id, plans: [], manifests: [], packs: new Map() }
            sessions.set(info.id, session)
        }
        if(info.kind === 'plan'){
            session.plans.push(file)
        }
        else if(info.kind === 'manifest'){
            session.manifests.push(file)
        }
        else if(info.kind === 'pack'){
            const list = session.packs.get(info.seq) ?? []
            list.push(file)
            session.packs.set(info.seq, list)
        }
    }
    return sessions
}

function compareIds(a:string, b:string) {
    return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)
}

/**
 * Picks up the latest session that has a plan but no manifest. Packs are kept
 * while they form a valid chain from pack 1; the first broken pack and every
 * pack after it are deleted so the upload continues from there.
 */
async function resumeV2Session(
    ACCESS_TOKEN:string,
    sessions:Map<string, DriveV2Session>,
    latestCompleteId:string | null,
    filesByName:Map<string, DriveFile[]>
) {
    const incomplete = [...sessions.values()]
        .filter((session) => session.manifests.length === 0 && session.plans.length === 1)
        .filter((session) => !latestCompleteId || compareIds(session.id, latestCompleteId) > 0)
        .sort((a, b) => compareIds(a.id, b.id))
    const session = incomplete[incomplete.length - 1]
    if(!session){
        return null
    }

    let plan: DriveV2Plan
    try {
        plan = await getJsonFile<DriveV2Plan>(ACCESS_TOKEN, session.plans[0])
    } catch (error) {
        if(error instanceof DriveAuthError){
            throw error
        }
        console.warn(`Could not read the plan of backup ${session.id}, starting a new backup:`, error)
        return null
    }
    if(!isValidPlan(plan, session.id)){
        return null
    }

    const skipped = new Set(plan.skipped)
    const entryPacks = new Map<number, { s: number, e: number }>()
    const packSizes: Record<string, number> = {}
    const kept = new Set<string>()
    let position: PackPosition = { entry: 0, offset: 0 }
    let seq = 1
    for(;; seq++){
        let chosen: { file: DriveFile, start: PackPosition, end: PackPosition, size: number } | null = null
        for(const file of session.packs.get(seq) ?? []){
            const props = readPackProperties(file, session.id, seq)
            if(props && continuesFrom(position, props.start, skipped) && isAfter(props.end, props.start) && props.end.entry <= plan.entries.length){
                chosen = { file, ...props }
                break
            }
        }
        if(!chosen){
            break
        }
        kept.add(chosen.file.id)
        packSizes[chosen.file.name] = chosen.size
        const range = coveredEntries(chosen.start, chosen.end)
        if(range){
            for(let i = range[0]; i <= range[1]; i++){
                markEntryPack(entryPacks, i, seq)
            }
        }
        position = chosen.end
    }

    //broken, duplicated or orphaned packs are uploaded again
    for(const list of session.packs.values()){
        for(const file of list){
            if(!kept.has(file.id)){
                await deleteFile(ACCESS_TOKEN, file.id)
                const sameName = filesByName.get(file.name)
                if(sameName){
                    filesByName.set(file.name, sameName.filter((item) => item.id !== file.id))
                }
            }
        }
    }

    console.log(`Resuming backup ${session.id} from pack ${seq}`)
    return {
        plan,
        planFileId: session.plans[0].id,
        position,
        nextSeq: seq,
        entryPacks,
        packSizes,
    }
}

function isValidPlan(plan:DriveV2Plan, id:string) {
    return plan?.version === DRIVE_V2_VERSION
        && plan.id === id
        && plan.limit === DRIVE_PACK_LIMIT
        && Array.isArray(plan.entries)
        && plan.entries.every((entry) => typeof entry === 'string')
        && Array.isArray(plan.skipped)
        && plan.skipped.every((index) => Number.isInteger(index))
}

const unsignedRegex = /^\d+$/

function readPackProperties(file:DriveFile, id:string, seq:number) {
    const props = file.appProperties
    if(!props || props.rv !== String(DRIVE_V2_VERSION) || props.rb !== id || props.rs !== String(seq)){
        return null
    }
    const values = [props.rn, props.si, props.so, props.ei, props.eo]
    if(!values.every((value) => unsignedRegex.test(value ?? ''))){
        return null
    }
    const [size, si, so, ei, eo] = values.map(Number)
    //a pack that did not arrive whole is uploaded again
    if(file.size !== String(size)){
        return null
    }
    return {
        size,
        start: { entry: si, offset: so },
        end: { entry: ei, offset: eo },
    }
}

function continuesFrom(position:PackPosition, start:PackPosition, skipped:Set<number>) {
    if(start.entry === position.entry && start.offset === position.offset){
        return true
    }
    //entries skipped at a pack boundary leave a gap
    if(position.offset !== 0 || start.offset !== 0 || start.entry < position.entry){
        return false
    }
    for(let i = position.entry; i < start.entry; i++){
        if(!skipped.has(i)){
            return false
        }
    }
    return true
}

function isAfter(end:PackPosition, start:PackPosition) {
    return end.entry > start.entry || (end.entry === start.entry && end.offset > start.offset)
}

function markEntryPack(entryPacks:Map<number, { s: number, e: number }>, index:number, seq:number) {
    const range = entryPacks.get(index)
    if(range){
        range.s = Math.min(range.s, seq)
        range.e = Math.max(range.e, seq)
    }
    else{
        entryPacks.set(index, { s: seq, e: seq })
    }
}

function groupFilesByName(files:DriveFile[]) {
    const map = new Map<string, DriveFile[]>()
    for(const file of files){
        const list = map.get(file.name) ?? []
        list.push(file)
        map.set(file.name, list)
    }
    return map
}

function pickFile(filesByName:Map<string, DriveFile[]>, name:string, size?:number) {
    const list = filesByName.get(name)
    if(!list || list.length === 0){
        return null
    }
    if(size === undefined){
        return list[0]
    }
    return list.find((file) => file.size === String(size)) ?? null
}

async function getJsonFile<T>(ACCESS_TOKEN:string, file:DriveFile): Promise<T> {
    return JSON.parse(new TextDecoder().decode(await getFileData(ACCESS_TOKEN, file.id)))
}

type DriveFile = {
    mimeType:string
    name:string
    id: string
    size?: string
    appProperties?: Record<string, string>
}

/**
 * Reads entries of a v2 backup. Recently used packs are kept in memory so
 * entries stored in the same pack are downloaded once. After `readAhead`,
 * the next download is started while the current one is being used.
 */
class DrivePackReader {
    //pack names, or `l:` + the name of a file uploaded on its own
    private cache = new Map<string, Promise<PackPiece[] | Uint8Array | null>>()
    private nextKey = new Map<string, string>()
    private readonly filesByName: Map<string, DriveFile[]>

    constructor(
        private readonly accessToken:string,
        files:DriveFile[],
        private readonly manifest:DriveV2Manifest
    ) {
        this.filesByName = groupFilesByName(files)
    }

    /** Sets the order the refs will be read in. */
    readAhead(refs:DrivePackRef[]) {
        const keys: string[] = []
        for(const ref of refs){
            if('l' in ref){
                keys.push('l:' + ref.l)
                continue
            }
            for(let seq = ref.s; seq <= ref.e; seq++){
                const key = packFileName(ref.b, seq)
                if(keys[keys.length - 1] !== key){
                    keys.push(key)
                }
            }
        }
        this.nextKey = new Map()
        for(let i = keys.length - 1; i > 0; i--){
            this.nextKey.set(keys[i - 1], keys[i])
        }
    }

    async read(name:string, ref:DrivePackRef): Promise<Uint8Array | null> {
        if('l' in ref){
            return await this.load('l:' + ref.l) as Uint8Array | null
        }
        //pieces are copied as each pack is read, so a file spanning many packs
        //never keeps more than the cached packs in memory
        const assembler = new EntryAssembler()
        for(let seq = ref.s; seq <= ref.e; seq++){
            const pack = await this.load(packFileName(ref.b, seq)) as PackPiece[] | null
            if(!pack){
                return null
            }
            for(const piece of pack){
                if(piece.name === name){
                    assembler.add(piece)
                }
            }
        }
        return assembler.value
    }

    private load(key:string) {
        let loading = this.cache.get(key)
        if(loading){
            this.cache.delete(key)
        }
        else{
            loading = this.fetch(key)
        }
        this.cache.set(key, loading)
        const next = this.nextKey.get(key)
        if(next && !this.cache.has(next)){
            this.cache.set(next, this.fetch(next))
        }
        //the current and the next download
        while(this.cache.size > DRIVE_PARALLEL){
            this.cache.delete(this.cache.keys().next().value)
        }
        return loading
    }

    private fetch(key:string) {
        const loading = key.startsWith('l:') ? this.fetchFile(key.slice(2)) : this.fetchPack(key)
        //a read-ahead that fails is reported when it is read, or never if it is dropped first
        loading.catch(() => {})
        return loading
    }

    private async fetchFile(name:string) {
        const file = pickFile(this.filesByName, name)
        return file ? await getFileData(this.accessToken, file.id) : null
    }

    private async fetchPack(name:string) {
        const file = pickFile(this.filesByName, name, this.manifest.packs?.[name])
            ?? pickFile(this.filesByName, name)
        if(!file){
            return null
        }
        for(let attempt = 0; attempt < 2; attempt++){
            try {
                return parsePack(await getFileData(this.accessToken, file.id)).pieces
            } catch (error) {
                if(error instanceof DriveAuthError){
                    throw error
                }
                console.warn(`Failed to read backup pack ${name}:`, error)
            }
        }
        return null
    }
}

type DriveBackupCandidate = {
    file: DriveFile
    //milliseconds
    time: number
    v2: boolean
}

type DriveRestoreSource = {
    version: 1
} | {
    version: 2
    manifest: DriveV2Manifest
    reader: DrivePackReader
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
    async function writeAsset(images:string, data:Uint8Array) {
        if(isTauri){
            await writeFile(`assets/` + images, data ,{baseDir: BaseDirectory.AppData})
        }
        else{
            await forageStorage.setItem('assets/' + images, data)
        }
    }
    const fileNames = files.map((d) => {
        return d.name
    })


    let dbs:DriveBackupCandidate[] = []
    let noSyncData = true

    if(mode === 'backup'){
        for(const f of files){
            if(f.name.endsWith("-database.risudat") && !parseV2FileName(f.name)){
                const tm = parseInt(f.name.split('-')[0])
                if(isNaN(tm)){
                    continue
                }
                else{
                    dbs.push({ file: f, time: tm * 1000, v2: false })
                }
            }
            else if(parseV2FileName(f.name)?.kind === 'manifest'){
                const id = parseV2FileName(f.name).id
                dbs.push({ file: f, time: parseInt(id), v2: true })
            }
        }
        dbs.sort((a,b) => {
            return b.time - a.time
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
                        dbs.push({ file: f, time: tm * 1000, v2: false })
                    }
                    noSyncData = false
                }
            }
        }
        dbs.sort((a,b) => {
            return b.time - a.time
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
        async function getDbFromList(): Promise<{ database: Database, kv: SaveKVData, source: DriveRestoreSource }>{
            let selectables:string[] = []
            for(let i=0;i<dbs.length;i++){
                selectables.push(`Backup saved in ${(new Date(dbs[i].time)).toLocaleString()}`)
                if(selectables.length > 7){
                    break
                }
            }
            const selectedIndex = (await alertSelect([language.loadLatest, language.loadOthers]) === '0') ? 0 : parseInt(await alertSelect(selectables))
            const selectedDb = dbs[selectedIndex]
            alertStore.set({
                type: "wait",
                msg: "Loading Backup..."
            })
            if(!selectedDb.v2){
                return { ...await decodeRisuSave(await getFileData(ACCESS_TOKEN, selectedDb.file.id)), source: { version: 1 } }
            }
            const manifest = await getJsonFile<DriveV2Manifest>(ACCESS_TOKEN, selectedDb.file)
            if(manifest?.version !== DRIVE_V2_VERSION || !manifest.entries){
                throw new Error(`Invalid backup manifest: ${selectedDb.file.name}`)
            }
            const dbFile = files.find((file) => file.name === manifest.database)
            if(!dbFile){
                throw new Error(`Backup database not found: ${manifest.database}`)
            }
            return {
                ...await decodeRisuSave(await getFileData(ACCESS_TOKEN, dbFile.id)),
                source: { version: 2, manifest, reader: new DrivePackReader(ACCESS_TOKEN, files, manifest) }
            }
        }

        //sync data is plain JSON and carries no SaveKV data
        const { database: db, kv, source }: { database: Database, kv: SaveKVData, source: DriveRestoreSource } = mode === 'backup'
            ? await getDbFromList()
            : { database: JSON.parse(Buffer.from(await getFileData(ACCESS_TOKEN, dbs[0].file.id)).toString('utf-8')), kv: {}, source: { version: 1 } }
        const readColdStorage = async (key:string) => {
            if(source.version === 2){
                const name = coldEntryName(getColdStorageBackupName(key))
                const ref = source.manifest.entries[name]
                return ref ? await source.reader.read(name, ref) : null
            }
            const names = new Set([
                getColdStorageBackupName(key),
                `coldstorage/${key}.json`,
                `${key}.json`
            ])
            const file = files.find((driveFile) => names.has(driveFile.name))
            return file ? await getFileData(ACCESS_TOKEN, file.id) : null
        }
        //v2: read cold storage in pack order too
        const orderColdStorage = source.version === 2 ? (keys:string[]) => {
            const withRef = keys.map((key) => ({ key, ref: source.manifest.entries[coldEntryName(getColdStorageBackupName(key))] }))
            const found = withRef.filter((item) => item.ref).sort((a, b) => comparePackRefs(a.ref, b.ref))
            source.reader.readAhead(found.map((item) => item.ref))
            return [...found, ...withRef.filter((item) => !item.ref)].map((item) => item.key)
        } : undefined
        const coldStorageRestoreFailures = await restoreColdStorageFromDrive(readColdStorage, db, mode, orderColdStorage)
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
        if(source.version === 2){
            const pending: [string, DrivePackRef][] = []
            const unrestored: string[] = []
            for(const images of requiredImages){
                if(await checkImageExists(images)){
                    continue
                }
                const ref = source.manifest.entries[assetEntryName(images)]
                if(!ref){
                    console.warn(`Asset not found in Drive backup: ${images}`)
                    unrestored.push(images)
                    continue
                }
                pending.push([images, ref])
            }
            //read entries in pack order so each pack is downloaded once
            pending.sort((a, b) => comparePackRefs(a[1], b[1]))
            source.reader.readAhead(pending.map(([, ref]) => ref))
            for(let i = 0; i < pending.length; i++){
                const [images, ref] = pending[i]
                alertStore.set({
                    type: "wait",
                    msg: `Loading Backup... (${i + 1} / ${pending.length})`
                })
                const fData = await source.reader.read(assetEntryName(images), ref)
                if(!fData){
                    console.warn(`Could not restore asset from Drive backup: ${images}`)
                    unrestored.push(images)
                    continue
                }
                await writeAsset(images, fData)
            }
            //the restored assets are kept either way, so declining still lets a rerun skip them
            if(unrestored.length > 0 && !await alertConfirm(language.driveRestoreIncomplete(unrestored.length, formatFileList(unrestored)))){
                return
            }
        }
        else{
            let ind = 0;
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
                                        await writeAsset(images, fData)
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

function comparePackRefs(a:DrivePackRef, b:DrivePackRef) {
    if('l' in a || 'l' in b){
        return ('l' in a ? 0 : 1) - ('l' in b ? 0 : 1)
    }
    return compareIds(a.b, b.b) || a.s - b.s
}

async function restoreColdStorageFromDrive(
    readItem:(key:string) => Promise<Uint8Array | null>,
    db:Database,
    mode:'backup'|'sync',
    order?:(keys:string[]) => string[]
) {
    const failures:string[] = []
    const restored = new Set<string>()
    const legacyPluginStorageKeys = new Set(listPluginStorageColdKeys(db))

    const restoreKeys = async (keys:string[], pluginStorageKeys:Set<string>) => {
        keys = order ? order(keys) : keys
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
            alertStore.set({
                type: "wait",
                msg: `${mode === 'sync' ? 'Sync' : 'Loading Backup'} Cold Storage... (${i + 1} / ${keys.length})`
            })
            try {
                const data = await readItem(key)
                if(!data){
                    console.warn(`Cold storage data not found in Drive backup: ${key}`)
                    failures.push(key)
                    continue
                }
                const jsonData = JSON.parse(new TextDecoder().decode(data))
                if(isValidColdStorageItem(jsonData, pluginStorageKeys.has(key))){
                    if(!await setColdStorageItem(key, jsonData)){
                        failures.push(key)
                    }
                }
                else{
                    console.warn(`Skipping invalid cold storage Drive item ${key}`)
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
    const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,size,appProperties)')
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

//not retried: a request that timed out may still have created the file, and a duplicated plan would block resuming
async function createFileInFolder(accessToken:string, fileName:string, content:Uint8Array, mimeType = 'application/octet-stream', appProperties?:Record<string, string>) {
    const metadata = {
      name: fileName,
      mimeType: mimeType,
      parents: ["appDataFolder"],
      appProperties,
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
      //an interrupted upload may still have created the file, so only retry
      //responses that say the request was not processed
      { repeatable: false }
    );

    return await response.json() as { id: string };
}

/**
 * Uploads with a resumable session so files over 5MB are accepted.
 * A failed upload restarts with a new session; duplicates left by a lost
 * response are harmless because packs are looked up by name and size.
 */
async function uploadLargeFile(accessToken:string, fileName:string, content:Uint8Array, mimeType = 'application/octet-stream', appProperties?:Record<string, string>) {
    const metadata = {
        name: fileName,
        mimeType: mimeType,
        parents: ["appDataFolder"],
        appProperties,
    }
    for(let attempt = 0;; attempt++){
        try {
            const session = await driveFetch(accessToken, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8',
                    'X-Upload-Content-Type': mimeType,
                    'X-Upload-Content-Length': String(content.byteLength),
                },
                body: JSON.stringify(metadata),
            })
            const location = session.headers.get('Location')
            if(!location){
                //the upload URL is hidden when the header is not exposed to the page
                return await createFileInFolder(accessToken, fileName, content, mimeType, appProperties)
            }
            const response = await driveFetch(accessToken, location, {
                method: "PUT",
                headers: {
                    'Content-Type': mimeType,
                },
                body: content as unknown as BodyInit,
            }, { retries: 0 })
            return await response.json() as { id: string }
        } catch (error) {
            if(error instanceof DriveAuthError || attempt >= 2){
                throw error
            }
            console.warn(`Upload of ${fileName} failed, restarting (${attempt + 1} / 2):`, error)
            await sleep(retryDelay(attempt))
        }
    }
}

async function updateFileContent(accessToken:string, fileId:string, content:Uint8Array, mimeType = 'application/octet-stream') {
    await driveFetch(accessToken, `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id`, {
        method: "PATCH",
        headers: {
            'Content-Type': mimeType,
        },
        body: content as unknown as BodyInit,
    })
}

async function deleteFile(accessToken:string, fileId:string) {
    try {
        await driveFetch(accessToken, `https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: "DELETE",
        })
    } catch (error) {
        if(error instanceof DriveRequestError && error.status === 404){
            return
        }
        throw error
    }
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
