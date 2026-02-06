import { BaseDirectory, readFile, readDir, writeFile } from "@tauri-apps/plugin-fs";
import localforage from "localforage";
import { alertError, alertNormal, alertStore, alertWait, alertMd, alertConfirm } from "../alert";
import { LocalWriter, forageStorage, requiresFullEncoderReload } from "../globalApi.svelte";
import { isTauri } from "src/ts/platform"
import { decodeRisuSave, encodeRisuSaveLegacy } from "../storage/risuSave";
import { getDatabase, setDatabaseLite, type InlayAssetMeta } from "../storage/database.svelte";
import { relaunch } from "@tauri-apps/plugin-process";
import { sleep } from "../util";
import { hubURL } from "../characterCards";
import { language } from "src/lang";

function getBasename(data:string){
    const baseNameRegex = /\\/g
    const splited = data.replace(baseNameRegex, '/').split('/')
    const lasts = splited[splited.length-1]
    return lasts
}

const backupAssetExts = [
    '.png', '.webp', '.jpg', '.jpeg', '.gif', '.avif',
    '.mp3', '.wav', '.ogg', '.flac',
    '.webm', '.mp4', '.mkv'
]

function isBackupAsset(name:string){
    return backupAssetExts.some((ext) => name.endsWith(ext))
}

type LegacyInlayAsset = {
    name?: string
    ext?: string
    height?: number
    width?: number
    type?: InlayAssetMeta['type']
    data?: string | Blob
}

const legacyInlayImageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif']
const legacyInlayAudioExts = ['wav', 'mp3', 'ogg', 'flac']
const legacyInlayVideoExts = ['webm', 'mp4', 'mkv']

function normalizeInlayExt(ext?: string) {
    return (ext ?? '').replace(/^\./, '').toLowerCase()
}

function getInlayTypeFromExt(ext: string): InlayAssetMeta['type'] {
    const lowered = normalizeInlayExt(ext)
    if (legacyInlayAudioExts.includes(lowered)) {
        return 'audio'
    }
    if (legacyInlayVideoExts.includes(lowered)) {
        return 'video'
    }
    return 'image'
}

async function legacyInlayDataToBytes(data: string | Blob): Promise<Uint8Array> {
    if (data instanceof Blob) {
        return new Uint8Array(await data.arrayBuffer())
    }
    if (typeof data === 'string') {
        if (data.startsWith('data:')) {
            const base64 = data.split(',')[1] ?? ''
            return new Uint8Array(Buffer.from(base64, 'base64'))
        }
        return new Uint8Array(Buffer.from(data, 'base64'))
    }
    return new Uint8Array()
}

export async function SaveLocalBackup(){
    alertWait("Saving local backup...")
    const writer = new LocalWriter()
    const r = await writer.init()
    if(!r){
        alertError('Failed')
        return
    }

    const db = getDatabase()
    const assetMap = new Map<string, { charName: string, assetName: string }>()
    if (db.characters) {
        for (const char of db.characters) {
            if (!char) continue
            const charName = char.name ?? 'Unknown Character'
            
            if (char.image) assetMap.set(char.image, { charName: charName, assetName: 'Main Image' })
            
            if (char.emotionImages) {
                for (const em of char.emotionImages) {
                    if (em && em[1]) assetMap.set(em[1], { charName: charName, assetName: em[0] })
                }
            }
            if (char.type !== 'group') {
                if (char.additionalAssets) {
                    for (const em of char.additionalAssets) {
                        if (em && em[1]) assetMap.set(em[1], { charName: charName, assetName: em[0] })
                    }
                }
                if (char.vits) {
                    const keys = Object.keys(char.vits.files)
                    for (const key of keys) {
                        const vit = char.vits.files[key]
                        if (vit) assetMap.set(vit, { charName: charName, assetName: key })
                    }
                }
                if (char.ccAssets) {
                    for (const asset of char.ccAssets) {
                        if (asset && asset.uri) assetMap.set(asset.uri, { charName: charName, assetName: asset.name })
                    }
                }
            }
        }
    }
    if (db.userIcon) {
        assetMap.set(db.userIcon, { charName: 'User Settings', assetName: 'User Icon' })
    }
    if (db.customBackground) {
        assetMap.set(db.customBackground, { charName: 'User Settings', assetName: 'Custom Background' })
    }
    const missingAssets: string[] = []

    if(isTauri){
        const assets = await readDir('assets', {baseDir: BaseDirectory.AppData})
        let i = 0;
        for(let asset of assets){
            i += 1;
            let message = `Saving local Backup... (${i} / ${assets.length})`
            if (missingAssets.length > 0) {
                const skippedItems = missingAssets.map(key => {
                    const assetInfo = assetMap.get(key);
                    return assetInfo ? `'${assetInfo.assetName}' from ${assetInfo.charName}` : `'${key}'`;
                }).join(', ');
                message += `\n(Skipping... ${skippedItems})`;
            }
            alertWait(message)

            const key = asset.name
            if(!key || !isBackupAsset(key)){
                continue
            }
            const data = await readFile('assets/' + asset.name, {baseDir: BaseDirectory.AppData})
            if (data) {
                await writer.writeBackup(key, data)
            } else {
                missingAssets.push(key)
            }
        }
    }
    else{
        const keys = await forageStorage.keys()

        for(let i=0;i<keys.length;i++){
            const key = keys[i]
            let message = `Saving local Backup... (${i + 1} / ${keys.length})`
            if (missingAssets.length > 0) {
                const skippedItems = missingAssets.map(key => {
                    const assetInfo = assetMap.get(key);
                    return assetInfo ? `'${assetInfo.assetName}' from ${assetInfo.charName}` : `'${key}'`;
                }).join(', ');
                message += `\n(Skipping... ${skippedItems})`;
            }
            alertWait(message)

            if(!key || !isBackupAsset(key)){
                continue
            }
            let data: Uint8Array | undefined;
            let isCached = false;
            if(forageStorage.isAccount && key.startsWith('assets/')){
                const cached = await localforage.getItem(key) as ArrayBuffer;
                if(cached) {
                    isCached = true;
                    data = new Uint8Array(cached);
                }
            }
            
            if (!data) {
                data = await forageStorage.getItem(key) as unknown as Uint8Array
            }

            if (data) {
                await writer.writeBackup(key, data)
            } else {
                missingAssets.push(key)
            }
            if(forageStorage.isAccount && !isCached){
                await sleep(1000)
            }
        }
    }

    const extraInlayMeta: Record<string, InlayAssetMeta> = {}
    try {
        // Include legacy inlay storage (localforage 'inlay') assets that haven't been migrated to db.inlayAssets yet.
        const inlayForage = localforage.createInstance({ name: 'inlay', storeName: 'inlay' })
        const legacyIds = await inlayForage.keys()
        if (legacyIds.length > 0) {
            for (let i = 0; i < legacyIds.length; i++) {
                const id = legacyIds[i]
                if (!id) {
                    continue
                }
                if (db.inlayAssets?.[id]) {
                    continue
                }

                alertWait(`Saving local Backup... (Inlays ${i + 1} / ${legacyIds.length})`)

                const legacy = (await inlayForage.getItem(id)) as unknown as LegacyInlayAsset | null
                if (!legacy?.data) {
                    missingAssets.push(`Inlay Asset: ${id}`)
                    continue
                }

                const ext = normalizeInlayExt(legacy.ext) || 'png'
                const type = legacy.type ?? getInlayTypeFromExt(ext)
                const bytes = await legacyInlayDataToBytes(legacy.data)
                if (!bytes || bytes.byteLength === 0) {
                    missingAssets.push(`Inlay Asset: ${id}`)
                    continue
                }

                const assetPath = `assets/${id}.${ext}`
                await writer.writeBackup(assetPath, bytes)
                extraInlayMeta[id] = {
                    path: assetPath,
                    ext,
                    type,
                    width: legacy.width ?? 0,
                    height: legacy.height ?? 0,
                    name: legacy.name ?? id
                }
            }
        }
    } catch (error) {
        console.warn('Failed to include legacy inlay assets in backup.', error)
    }

    const dbWithoutAccount = { ...db, account: undefined, inlayAssets: { ...(db.inlayAssets ?? {}), ...extraInlayMeta } }
    const dbData = encodeRisuSaveLegacy(dbWithoutAccount, 'compression')

    alertWait(`Saving local Backup... (Saving database)`) 

    await writer.writeBackup('database.risudat', dbData)
    await writer.close()

    if (missingAssets.length > 0) {
        let message = 'Backup Successful, but the following assets were missing and skipped:\n\n'
        for (const key of missingAssets) {
            const assetInfo = assetMap.get(key)
            if (assetInfo) {
                message += `* **${assetInfo.assetName}** (from *${assetInfo.charName}*)  \n  *File: ${key}*\n`
            } else {
                message += `* **Unknown Asset**  \n  *File: ${key}*\n`
            }
        }
        alertMd(message)
    } else {
        alertNormal('Success')
    }
}

/**
 * Saves a partial local backup with only critical assets.
 * 
 * Differences from SaveLocalBackup:
 * - Only includes profile images for characters/groups (excludes emotion images, additional assets, VITS files, CC assets)
 * - Additionally includes: persona icons, folder images, bot preset images
 * - Processes only assets in assetMap (selective) instead of all .png files in assets folder
 * - Faster and more efficient for quick backups
 * - Ideal for backing up core visual identity without bulk data
 */
export async function SavePartialLocalBackup(){
    // First confirmation: Explain the difference from regular backup
    const firstConfirm = await alertConfirm(language.partialBackupFirstConfirm)
    
    if (!firstConfirm) {
        return
    }
    
    // Second confirmation: Final warning about not saving assets
    const secondConfirm = await alertConfirm(language.partialBackupSecondConfirm)
    
    if (!secondConfirm) {
        return
    }
    
    alertWait("Saving partial local backup...")
    const writer = new LocalWriter()
    const r = await writer.init()
    if(!r){
        alertError('Failed')
        return
    }

    const db = getDatabase()
    const assetMap = new Map<string, { charName: string, assetName: string }>()
    
    // Only collect main profile images for both characters and groups
    if (db.characters) {
        for (const char of db.characters) {
            if (!char) continue
            const charName = char.name ?? 'Unknown Character'
            
            // Save the main profile image (supports both character and group types)
            // Note: emotionImages are intentionally excluded from partial backup
            if (char.image) {
                assetMap.set(char.image, { charName: charName, assetName: 'Profile Image' })
            }
        }
    }
    
    // User icon
    if (db.userIcon) {
        assetMap.set(db.userIcon, { charName: 'User Settings', assetName: 'User Icon' })
    }
    
    // Persona icons
    if (db.personas) {
        for (const persona of db.personas) {
            if (persona && persona.icon) {
                assetMap.set(persona.icon, { charName: 'Persona', assetName: `${persona.name} Icon` })
            }
        }
    }
    
    // Custom background
    if (db.customBackground) {
        assetMap.set(db.customBackground, { charName: 'User Settings', assetName: 'Custom Background' })
    }
    
    // Folder images in characterOrder
    if (db.characterOrder) {
        for (const item of db.characterOrder) {
            if (typeof item !== 'string' && item.img) {
                assetMap.set(item.img, { charName: 'Folder', assetName: `${item.name} Folder Image` })
            }
            if (typeof item !== 'string' && item.imgFile) {
                assetMap.set(item.imgFile, { charName: 'Folder', assetName: `${item.name} Folder Image File` })
            }
        }
    }
    
    // Bot preset images
    if (db.botPresets) {
        for (const preset of db.botPresets) {
            if (preset && preset.image) {
                assetMap.set(preset.image, { charName: 'Preset', assetName: `${preset.name} Preset Image` })
            }
        }
    }
    
    const missingAssets: string[] = []

    if(isTauri){
        // readDir returns entries without 'assets/' prefix, unlike forageStorage.keys()
        const assets = await readDir('assets', {baseDir: BaseDirectory.AppData})
        let i = 0;
        for(let asset of assets){
            if(!asset.name){
                continue
            }

            const keyWithPrefix = asset.name.startsWith('assets/') ? asset.name : `assets/${asset.name}`
            if(!keyWithPrefix.endsWith('.png')){
                continue
            }
            
            // Only process if this asset is in our map (profile images only)
            if(!assetMap.has(keyWithPrefix)){
                continue
            }
            
            i += 1;
            let message = `Saving partial local backup... (${i} / ${assetMap.size})`
            if (missingAssets.length > 0) {
                const skippedItems = missingAssets.map(key => {
                    const assetInfo = assetMap.get(key);
                    return assetInfo ? `'${assetInfo.assetName}' from ${assetInfo.charName}` : `'${key}'`;
                }).join(', ');
                message += `\n(Skipping... ${skippedItems})`;
            }
            alertWait(message)

            const data = await readFile(keyWithPrefix, {baseDir: BaseDirectory.AppData})
            if (data) {
                await writer.writeBackup(keyWithPrefix, data)
            } else {
                missingAssets.push(keyWithPrefix)
            }
        }
    }
    else{
        const keys = await forageStorage.keys()
        const assetKeys = Array.from(assetMap.keys())

        for(let i=0;i<assetKeys.length;i++){
            const key = assetKeys[i]
            let message = `Saving partial local backup... (${i + 1} / ${assetKeys.length})`
            if (missingAssets.length > 0) {
                const skippedItems = missingAssets.map(key => {
                    const assetInfo = assetMap.get(key);
                    return assetInfo ? `'${assetInfo.assetName}' from ${assetInfo.charName}` : `'${key}'`;
                }).join(', ');
                message += `\n(Skipping... ${skippedItems})`;
            }
            alertWait(message)

            if(!key || !key.endsWith('.png')){
                continue
            }
            
            let data: Uint8Array | undefined;
            let isCached = false;
            if(forageStorage.isAccount && key.startsWith('assets/')){
                const cached = await localforage.getItem(key) as ArrayBuffer;
                if(cached) {
                    isCached = true;
                    data = new Uint8Array(cached);
                }
            }
            
            if (!data) {
                data = await forageStorage.getItem(key) as unknown as Uint8Array
            }

            if (data) {
                await writer.writeBackup(key, data)
            } else {
                missingAssets.push(key)
            }
            if(forageStorage.isAccount && !isCached){
                await sleep(100)
            }
        }
    }

    const dbWithoutAccount = { ...db, account: undefined }
    const dbData = encodeRisuSaveLegacy(dbWithoutAccount, 'compression')

    alertWait(`Saving partial local backup... (Saving database)`) 

    await writer.writeBackup('database.risudat', dbData)
    await writer.close()

    if (missingAssets.length > 0) {
        let message = 'Partial backup successful, but the following profile images were missing and skipped:\n\n'
        for (const key of missingAssets) {
            const assetInfo = assetMap.get(key)
            if (assetInfo) {
                message += `* **${assetInfo.assetName}** (from *${assetInfo.charName}*)  \n  *File: ${key}*\n`
            } else {
                message += `* **Unknown Asset**  \n  *File: ${key}*\n`
            }
        }
        alertMd(message)
    } else {
        alertNormal('Success')
    }
}

export function LoadLocalBackup(){
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.bin';
        input.onchange = async () => {
            if (!input.files || input.files.length === 0) {
                input.remove();
                return;
            }
            const file = input.files[0];
            input.remove();

            const reader = file.stream().getReader();
            const CHUNK_SIZE = 1024 * 1024; // 1MB chunk size
            let bytesRead = 0;
            let remainingBuffer = new Uint8Array();

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    break;
                }

                bytesRead += value.length;
                const progress = ((bytesRead / file.size) * 100).toFixed(2);
                alertWait(`Loading local Backup... (${progress}%)`);

                const newBuffer = new Uint8Array(remainingBuffer.length + value.length);
                newBuffer.set(remainingBuffer);
                newBuffer.set(value, remainingBuffer.length);
                remainingBuffer = newBuffer;

                let offset = 0;
                while (offset + 4 <= remainingBuffer.length) {
                    const nameLength = new Uint32Array(remainingBuffer.slice(offset, offset + 4).buffer)[0];

                    if (offset + 4 + nameLength > remainingBuffer.length) {
                        break;
                    }
                    const nameBuffer = remainingBuffer.slice(offset + 4, offset + 4 + nameLength);
                    const name = new TextDecoder().decode(nameBuffer);

                    if (offset + 4 + nameLength + 4 > remainingBuffer.length) {
                        break;
                    }
                    const dataLength = new Uint32Array(remainingBuffer.slice(offset + 4 + nameLength, offset + 4 + nameLength + 4).buffer)[0];

                    if (offset + 4 + nameLength + 4 + dataLength > remainingBuffer.length) {
                        break;
                    }
                    const data = remainingBuffer.slice(offset + 4 + nameLength + 4, offset + 4 + nameLength + 4 + dataLength);

                    if (name === 'database.risudat') {
                        const db = new Uint8Array(data);
                        const dbData = await decodeRisuSave(db);
                        setDatabaseLite(dbData);
                        requiresFullEncoderReload.state = true;
                        if (isTauri) {
                            await writeFile('database/database.bin', db, { baseDir: BaseDirectory.AppData });
                            await relaunch();
                            alertStore.set({
                                type: "wait",
                                msg: "Success, Refreshing your app."
                            });
                        } else {
                            await forageStorage.setItem('database/database.bin', db);
                            location.search = '';
                            alertStore.set({
                                type: "wait",
                                msg: "Success, Refreshing your app."
                            });
                        }
                    } else {
                        if (isTauri) {
                            await writeFile(`assets/` + name, data, { baseDir: BaseDirectory.AppData });
                        } else {
                            await forageStorage.setItem('assets/' + name, data);
                        }
                    }
                    await sleep(10);
                    if (forageStorage.isAccount) {
                        await sleep(1000);
                    }

                    offset += 4 + nameLength + 4 + dataLength;
                }
                remainingBuffer = remainingBuffer.slice(offset);
            }

            alertNormal('Success');
        };

        input.click();
    } catch (error) {
        console.error(error);
        alertError('Failed, Is file corrupted?')
    }
}
