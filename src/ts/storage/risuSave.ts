import { Packr, Unpackr, decode } from "msgpackr/index-no-eval";
import * as fflate from "fflate";
import { getDatabase, presetTemplate, type Database } from "./database.svelte";
import localforage from "localforage";
import { forageStorage } from "../globalApi.svelte";
import { isNodeServer, isTauri } from "src/ts/platform"
import type { SaveKVData, SaveKVSource } from "./saveKV"
import {
    writeFile,
    BaseDirectory,
    exists,
    mkdir,
    readFile,
} from "@tauri-apps/plugin-fs"

const packr = new Packr({
    useRecords:false
});

const unpackr = new Unpackr({
    int64AsType: 'number',
    useRecords:false
})

const disableRemoteSaving = () => {
    try {
        const db = getDatabase()
        return !db.enableRemoteSaving
    } catch (error) {
        return true
    }
}
const checkedRemoteExistence = new Set<string>();
const magicHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 7]); 
const magicCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 8]);
const magicStreamCompressedHeader = new Uint8Array([0, 82, 73, 83, 85, 83, 65, 86, 69, 0, 9]);
const magicRisuSaveHeader = new TextEncoder().encode("RISUSAVE\0");


async function checkCompressionStreams(){
    if(!CompressionStream){
        const {makeCompressionStream} = await import('compression-streams-polyfill/ponyfill');
        //@ts-expect-error polyfill CompressionStream type is incompatible with globalThis.CompressionStream
        globalThis.CompressionStream = makeCompressionStream(TransformStream);
    }
    if(!DecompressionStream){
        const {makeDecompressionStream} = await import('compression-streams-polyfill/ponyfill');
        //@ts-expect-error polyfill DecompressionStream type is incompatible with globalThis.DecompressionStream
        globalThis.DecompressionStream = makeDecompressionStream(TransformStream);
    }
}

export async function encodeRisuSaveCompressionStream(data:any) {
    await checkCompressionStreams()
    let encoded:Uint8Array = packr.encode(data)
    const cs = new CompressionStream('gzip');
    const writer = cs.writable.getWriter();
    writer.write(encoded as any);
    writer.close();
    const buf = await new Response(cs.readable).arrayBuffer()
    const result = new Uint8Array(new Uint8Array(buf).length + magicStreamCompressedHeader.length);
    result.set(magicStreamCompressedHeader, 0)
    result.set(new Uint8Array(buf), magicStreamCompressedHeader.length)
    return result
}

export type toSaveType = {
    /** chaIds whose blocks must be re-encoded (an id that is no longer in the database means the character was deleted) */
    character: string[];
    /**
     * [chaId, chatId] pairs of chats that changed. Only used when chats are saved as separate blocks.
     * A dirty character without any entry here (and not in allChats) has all of its chats re-encoded.
     */
    chat: [string, string][];
    /** chaIds whose chats must all be re-encoded. Only used when chats are saved as separate blocks. */
    allChats?: string[];
    botPreset: boolean;
    modules: boolean;
    loadouts: boolean;
    plugins: boolean;
    pluginCustomStorage: boolean;
    /** SaveKV namespaces to re-encode */
    kv?: string[];
}

enum RisuSaveType {
    CONFIG = 0,
    ROOT = 1,
    CHARACTER_WITH_CHAT = 2,
    CHAT = 3,
    BOTPRESET = 4,
    MODULES = 5,
    REMOTE = 6,
    CHARACTER_WITHOUT_CHAT = 7,
    ROOT_COMPONENT = 8,
    PLUGINS = 9,
    LOADOUTS = 10,
    PLUGIN_STORAGE = 11,
    /** SaveKV namespace (`kv:<namespace>`), see saveKV.ts */
    KV = 12,
}

const KV_BLOCK_PREFIX = 'kv:'

/**
 * Split chat storage (opt-in, see RisuSaveEncoder's splitChats option):
 * - a CHARACTER_WITHOUT_CHAT block named after the chaId holds the character JSON, but its `chats`
 *   property is replaced with `{ "__risuSplitChats": 1, "ids": [chatId, ...] }` (the chat order).
 *   A legacy CHARACTER_WITHOUT_CHAT block with a `chats` array is still read as a full character.
 *   An object in `chats` is also not iterable for older clients, which makes them fail to load
 *   the save (and fall back to backups) instead of silently loading characters without chats.
 * - one CHAT block per chat, named `chat-<chaId>-<chatId>`, holding
 *   `{ "v": 1, "chaId": ..., "chatId": ..., "chat": {...} }`. The decoder only uses the payload.
 */
const SPLIT_CHATS_KEY = '__risuSplitChats'
const CHAT_BLOCK_PREFIX = 'chat-'
const MAX_BLOCK_NAME_BYTES = 255
const RESERVED_BLOCK_NAMES = new Set(['root', 'preset', 'modules', 'loadouts', 'plugins', 'pluginStorage', 'config'])

type ChatBlockPayload = {
    v: number
    chaId: string
    chatId: string
    chat: any
}

function utf8Length(str:string){
    return new TextEncoder().encode(str).length
}

function chatBlockName(chaId:string, chatId:string){
    return `${CHAT_BLOCK_PREFIX}${chaId}-${chatId}`
}

/** returns the recorded chat order of a split character, or null if the character holds its chats itself */
function getSplitChatIds(character:any):string[]|null{
    const chats = character?.chats
    if(!chats || typeof chats !== 'object' || Array.isArray(chats) || !(SPLIT_CHATS_KEY in chats)){
        return null
    }
    if(!Array.isArray(chats.ids)){
        return []
    }
    return chats.ids.filter((id:unknown) => typeof id === 'string')
}

function makeMissingChatPlaceholder(chatId:string){
    return {
        id: chatId,
        name: 'Chat (failed to load)',
        note: '',
        localLore: [],
        message: [{
            time: Date.now(),
            data: `[Chat data could not be loaded. Chat ID: ${chatId}. It may still be recoverable from a backup.]`,
            role: 'char'
        }]
    }
}

type CharacterEncodeContext = {
    /** every chaId in the database */
    chaIds: Set<string>
    /** chaIds used by more than one character */
    duplicateChaIds: Set<string>
}

/** 'all', or the ids of the chats that changed */
type DirtyChats = 'all' | Set<string>

type EncodeBlockArg = {
    compression:boolean
    data:string
    type:RisuSaveType
    name:string
    cache?:boolean
    skipRemoteSaving?:boolean
}

type EncodeBlockOption = {
    remote: 'none'|'prefer'|'force'
}

const risuSaveCacheForage = localforage.createInstance({
    name: 'risuSaveCache'
});
export class RisuSaveEncoder {

    private blocks: { [key: string]: Uint8Array } = {};
    private compression: boolean = false;
    private kv: SaveKVSource | null = null;
    /** false: never write blocks to separate remote files (self-contained exports) */
    private allowRemote: boolean;
    /** false: do not write blocks to the local block cache (exports must not touch the live save's cache) */
    private cacheBlocks: boolean;
    /** true: save each chat of a character as its own block (older clients cannot read this) */
    readonly splitChats: boolean;
    /** chaId -> (chatId -> chat block name) for characters currently saved as split blocks */
    private splitChatBlocks: Map<string, Map<string, string>> = new Map();
    /** chat block name -> chaId of the character that owns it */
    private chatBlockOwner: Map<string, string> = new Map();
    /** names of dropped chat blocks whose block cache entry is not removed yet */
    private staleChatCache: Set<string> = new Set();

    constructor(options: { remote?: boolean, cache?: boolean, splitChats?: boolean } = {}){
        this.allowRemote = options.remote ?? true;
        this.cacheBlocks = options.cache ?? true;
        this.splitChats = options.splitChats ?? false;
    }

    async init(data:Database,arg:{
        compression?: boolean,
        skipRemoteSavingOnCharacters?: boolean,
        kv?: SaveKVSource | null
    } = {}){
        const {
            compression = false,
            skipRemoteSavingOnCharacters = true,
            kv = null
        } = arg;
        this.compression = compression;
        this.kv = kv;
        let obj:Record<any,any> = {}
        let keys = Object.keys(data)
        for(const key of keys){
            if(key !== 'characters' && key !== 'botPresets' && key !== 'modules'){
                obj[key] = data[key]
            }
        }
        this.blocks['root'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(obj),
            type: RisuSaveType.ROOT,
            name: 'root'
        });
        this.blocks['preset'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.botPresets),
            type: RisuSaveType.BOTPRESET,
            name: 'preset'
        });
        this.blocks['modules'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.modules),
            type: RisuSaveType.MODULES,
            name: 'modules'
        });
        this.blocks['loadouts'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.loadouts),
            type: RisuSaveType.LOADOUTS,
            name: 'loadouts'
        });
        this.blocks['plugins'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.plugins),
            type: RisuSaveType.PLUGINS,
            name: 'plugins'
        });
        this.blocks['pluginStorage'] = await this.encodeBlock({
            compression,
            data: JSON.stringify(data.pluginCustomStorage),
            type: RisuSaveType.PLUGIN_STORAGE,
            name: 'pluginStorage'
        });
        const context = this.makeCharacterContext(data);
        for( const character of data.characters ?? []) {
            await this.encodeCharacter(character, context, 'all', skipRemoteSavingOnCharacters);
        }
        for(const ns of kv?.namespaces() ?? []){
            await this.encodeKVBlock(ns);
        }
        this.blocks['config'] = await this.encodeBlock({
            compression,
            data: JSON.stringify({
                version: 1
            }),
            type: RisuSaveType.CONFIG,
            name: "config"
        })
    }

    async set(data:Database, toSave:toSaveType){
        let obj:Record<any,any> = {}
        let keys = Object.keys(data)
        for(const key of keys){
            if(
                key !== 'characters' && key !== 'botPresets' && key !== 'modules' &&
                key !== 'loadouts' && key !== 'plugins' && key !== 'pluginCustomStorage'
            ){
                obj[key] = data[key]
            }
        }

        const context = this.makeCharacterContext(data);
        await this.releaseCollidingChatBlocks(data, context);

        const dirtyChats = new Map<string, Set<string>>();
        for(const [chaId, chatId] of toSave.chat ?? []){
            if(!dirtyChats.has(chaId)){
                dirtyChats.set(chaId, new Set());
            }
            dirtyChats.get(chaId).add(chatId);
        }
        const allChatsDirty = new Set(toSave.allChats ?? []);

        const savedId = new Set<string>();
        for(const character of data.characters) {
            const index = toSave.character.indexOf(character.chaId);
            if (index !== -1) {
                //no chat information for a dirty character: treat every chat as dirty
                const dirty:DirtyChats = (allChatsDirty.has(character.chaId) || !dirtyChats.has(character.chaId))
                    ? 'all'
                    : dirtyChats.get(character.chaId);
                await this.encodeCharacter(character, context, dirty);
                savedId.add(character.chaId);
                toSave.character.splice(index, 1);
            }
            else if(!this.blocks[character.chaId]){
                await this.encodeCharacter(character, context, 'all');
                savedId.add(character.chaId);
            }
        }
        if(toSave.character.length > 0){
            console.log(`Deleting character data: ${toSave.character.join(', ')}`);
            //probably deleted characters
            for(const chaId of toSave.character){
                if(!savedId.has(chaId)){
                    if(!this.chatBlockOwner.has(chaId)){
                        delete this.blocks[chaId];
                    }
                    this.removeChatBlocks(chaId);
                }
            }
        }

        if(toSave.botPreset){
            this.blocks['preset'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.botPresets),
                type: RisuSaveType.BOTPRESET,
                name: 'preset'
            });
        }
        if(toSave.modules){
            this.blocks['modules'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.modules),
                type: RisuSaveType.MODULES,
                name: 'modules'
            });
        }

        if(toSave.loadouts){
            this.blocks['loadouts'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.loadouts),
                type: RisuSaveType.LOADOUTS,
                name: 'loadouts'
            });
        }

        if(toSave.pluginCustomStorage){
            this.blocks['pluginStorage'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.pluginCustomStorage),
                type: RisuSaveType.PLUGIN_STORAGE,
                name: 'pluginStorage'
            });
        }

        if(toSave.plugins){
            this.blocks['plugins'] = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(data.plugins),
                type: RisuSaveType.PLUGINS,
                name: 'plugins'
            });
        }

        for(const ns of toSave.kv ?? []){
            await this.encodeKVBlock(ns);
        }

        obj["__directory"] = Object.keys(this.blocks).filter(key => key !== 'root');
        this.blocks['root'] = await this.encodeBlock({
            compression: this.compression,
            data: JSON.stringify(obj),
            type: RisuSaveType.ROOT,
            name: 'root'
        });
        await this.removeStaleChatCache();
    }

    encode(arg:{
        compression?: boolean
    } = {}){
        if(!this.blocks['config']){
            return null
        }
        let totalLength = 0
        for(const key in this.blocks){
            totalLength += this.blocks[key].length;
        }
        totalLength += magicRisuSaveHeader.length;
        const arrayBuf = new ArrayBuffer(totalLength);
        const view = new Uint8Array(arrayBuf);
        let offset = 0;
        view.set(magicRisuSaveHeader, offset);
        offset += magicRisuSaveHeader.length;
        for(const key in this.blocks){
            view.set(this.blocks[key], offset);
            offset += this.blocks[key].length;
        }
        console.log(Object.keys(this.blocks).length, 'blocks encoded');
        return arrayBuf;
    }

    private async encodeKVBlock(ns: string){
        const name = KV_BLOCK_PREFIX + ns
        const content = this.kv ? this.kv.encodeNamespace(ns) : null
        if(content === null){
            delete this.blocks[name]
            return
        }
        this.blocks[name] = await this.encodeBlock({
            compression: this.compression,
            data: content,
            type: RisuSaveType.KV,
            name
        });
    }

    private makeCharacterContext(data:Database):CharacterEncodeContext{
        const chaIds = new Set<string>();
        const duplicateChaIds = new Set<string>();
        for(const character of data.characters ?? []){
            const chaId = character?.chaId;
            if(chaIds.has(chaId)){
                duplicateChaIds.add(chaId);
            }
            chaIds.add(chaId);
        }
        return { chaIds, duplicateChaIds };
    }

    /**
     * Returns the chat ids and block names to save the character as split blocks,
     * or null if this character must be saved as a single legacy block.
     */
    private planSplitCharacter(character:Database['characters'][number], context:CharacterEncodeContext){
        if(!this.splitChats){
            return null;
        }
        const chaId = character?.chaId;
        if(typeof chaId !== 'string' || chaId === '' || context.duplicateChaIds.has(chaId)){
            return null;
        }
        if(utf8Length(chaId) > MAX_BLOCK_NAME_BYTES || !Array.isArray(character.chats)){
            return null;
        }
        //remote characters are kept in the legacy format for now
        if(this.shouldEncodeRemote({ remote: 'prefer' })){
            return null;
        }
        const chatIds:string[] = [];
        const names:string[] = [];
        //chat references are taken now: the array may change while blocks are encoded (awaits in between)
        const chats = [...character.chats];
        const seen = new Set<string>();
        for(const chat of chats){
            const chatId = chat?.id;
            if(!chat || typeof chat !== 'object' || typeof chatId !== 'string' || chatId === '' || seen.has(chatId)){
                return null;
            }
            seen.add(chatId);
            const name = chatBlockName(chaId, chatId);
            if(
                utf8Length(name) > MAX_BLOCK_NAME_BYTES ||
                RESERVED_BLOCK_NAMES.has(name) ||
                name.startsWith(KV_BLOCK_PREFIX) ||
                context.chaIds.has(name)
            ){
                return null;
            }
            const owner = this.chatBlockOwner.get(name);
            if(owner !== undefined ? owner !== chaId : this.blocks[name] !== undefined){
                return null;
            }
            chatIds.push(chatId);
            names.push(name);
        }
        return { chaId, chatIds, names, chats };
    }

    /** character JSON with `chats` replaced by the split marker and chat order, keeping the key order */
    private serializeSplitCharacter(character:Database['characters'][number], chatIds:string[]){
        const obj:Record<string, any> = {};
        for(const key of Object.keys(character)){
            obj[key] = key === 'chats' ? { [SPLIT_CHATS_KEY]: 1, ids: chatIds } : (character as Record<string, any>)[key];
        }
        return JSON.stringify(obj);
    }

    /**
     * Encodes a character either as split blocks or as a single legacy block, and removes blocks it no longer needs.
     * Blocks are only replaced after everything was encoded, so a failure leaves the previous blocks in place.
     */
    private async encodeCharacter(character:Database['characters'][number], context:CharacterEncodeContext, dirty:DirtyChats, skipRemoteSaving?:boolean){
        const plan = this.planSplitCharacter(character, context);
        if(!plan){
            const block = await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(character),
                type: RisuSaveType.CHARACTER_WITH_CHAT,
                name: character.chaId,
                skipRemoteSaving
            }, {
                remote: 'prefer'
            });
            this.blocks[character.chaId] = block;
            this.removeChatBlocks(character.chaId);
            return;
        }

        const { chaId, chatIds, names, chats } = plan;
        const previous = this.splitChatBlocks.get(chaId);
        const encodedChats:[string, Uint8Array][] = [];
        for(let i = 0; i < chatIds.length; i++){
            const name = names[i];
            const needsEncode = dirty === 'all' ||
                dirty.has(chatIds[i]) ||
                !previous?.has(chatIds[i]) ||
                this.blocks[name] === undefined;
            if(!needsEncode){
                continue;
            }
            const payload:ChatBlockPayload = {
                v: 1,
                chaId,
                chatId: chatIds[i],
                chat: chats[i]
            };
            encodedChats.push([name, await this.encodeBlock({
                compression: this.compression,
                data: JSON.stringify(payload),
                type: RisuSaveType.CHAT,
                name
            }, {
                remote: 'none'
            })]);
        }
        const characterBlock = await this.encodeBlock({
            compression: this.compression,
            data: this.serializeSplitCharacter(character, chatIds),
            type: RisuSaveType.CHARACTER_WITHOUT_CHAT,
            name: chaId
        }, {
            remote: 'none'
        });

        //commit
        this.blocks[chaId] = characterBlock;
        const current = new Map<string, string>();
        for(let i = 0; i < chatIds.length; i++){
            current.set(chatIds[i], names[i]);
            this.chatBlockOwner.set(names[i], chaId);
        }
        for(const [name, block] of encodedChats){
            this.blocks[name] = block;
        }
        const currentNames = new Set(names);
        for(const name of previous?.values() ?? []){
            if(!currentNames.has(name) && this.chatBlockOwner.get(name) === chaId){
                delete this.blocks[name];
                this.chatBlockOwner.delete(name);
                this.staleChatCache.add(name);
            }
        }
        this.splitChatBlocks.set(chaId, current);
    }

    /** removes every chat block of a character (it was deleted or is saved as a legacy block now) */
    private removeChatBlocks(chaId:string){
        const previous = this.splitChatBlocks.get(chaId);
        if(!previous){
            return;
        }
        for(const name of previous.values()){
            if(this.chatBlockOwner.get(name) === chaId){
                delete this.blocks[name];
                this.chatBlockOwner.delete(name);
                this.staleChatCache.add(name);
            }
        }
        this.splitChatBlocks.delete(chaId);
    }

    /**
     * Removes the block cache entries of dropped chat blocks, so deleted chats do not pile up in IndexedDB.
     * A name that is in use again (by a re-created chat or a character block) keeps its fresh entry.
     * Best effort: a failure here must not fail the save, and the entry is retried on the next set.
     */
    private async removeStaleChatCache(){
        if(!this.cacheBlocks){
            //nothing was cached by this encoder (exports)
            this.staleChatCache.clear();
            return;
        }
        for(const name of [...this.staleChatCache]){
            if(this.blocks[name] !== undefined){
                this.staleChatCache.delete(name);
                continue;
            }
            try {
                await risuSaveCacheForage.removeItem(`risuSaveBlock_${name}`);
                this.staleChatCache.delete(name);
            } catch (error) {
                console.error(`Error removing cached chat block ${name}:`, error);
            }
        }
    }

    /**
     * A character whose chaId equals an existing chat block name would overwrite that block.
     * Save the owner of such a block as a legacy block first (its plan now fails on the collision).
     */
    private async releaseCollidingChatBlocks(data:Database, context:CharacterEncodeContext){
        for(const chaId of context.chaIds){
            const owner = this.chatBlockOwner.get(chaId);
            if(owner === undefined){
                continue;
            }
            const ownerCharacter = data.characters.find((c) => c?.chaId === owner);
            if(ownerCharacter && !context.duplicateChaIds.has(owner)){
                await this.encodeCharacter(ownerCharacter, context, 'all');
            }
            if(this.chatBlockOwner.get(chaId) === owner){
                //owner is not in the database anymore; drop only the colliding block
                delete this.blocks[chaId];
                this.chatBlockOwner.delete(chaId);
                for(const [chatId, name] of this.splitChatBlocks.get(owner) ?? []){
                    if(name === chaId){
                        this.splitChatBlocks.get(owner).delete(chatId);
                    }
                }
            }
        }
    }

    private shouldEncodeRemote(option:EncodeBlockOption){
        return this.allowRemote &&
            (
                option.remote === 'force' ||
                (
                    option.remote === 'prefer' &&
                    (
                        isTauri ||
                        isNodeServer
                    )
                ) &&
                !disableRemoteSaving()
            );
    }

    async encodeBlock(arg:EncodeBlockArg, option:EncodeBlockOption = { remote: 'none' }){
        if(this.shouldEncodeRemote(option)){
            return await this.encodeRemoteBlock(arg);
        }
        return await this.encodeRawBlock(arg);
    }

    async encodeRawBlock(arg:EncodeBlockArg){
        let databuf: Uint8Array;
        const cacheBlock = arg.cache ?? true;
        if(arg.compression){
            await checkCompressionStreams();
            const cs = new CompressionStream('gzip');
            const writer = cs.writable.getWriter();
            writer.write(new TextEncoder().encode(arg.data));
            writer.close();
            const compressedData = await new Response(cs.readable).arrayBuffer();
            databuf = (new Uint8Array(compressedData));
        }
        else{
            databuf = (new TextEncoder().encode(arg.data));
        }
        const nameBuf = new TextEncoder().encode(arg.name);
        const lengthBuf = new ArrayBuffer(4);
        new Uint32Array(lengthBuf)[0] = databuf.length;
        const arrayBuf = new ArrayBuffer(2 + 1 + nameBuf.length + 4 + databuf.length);
        const buf = new Uint8Array(arrayBuf);
        buf.set(new Uint8Array([arg.type, arg.compression ? 1 : 0]), 0);
        buf.set(new Uint8Array([nameBuf.length]), 2);
        buf.set(nameBuf, 3);
        buf.set(new Uint8Array(lengthBuf), 3 + nameBuf.length);
        buf.set(databuf, 7 + nameBuf.length);
        if(this.cacheBlocks && cacheBlock){
            await risuSaveCacheForage.setItem(`risuSaveBlock_${arg.name}`, {
                type: arg.type,
                data: arg.data,
                name: arg.name,
            });
        }
        return buf;
    }

    async encodeRemoteBlock(arg:EncodeBlockArg){
        console.log(`Encoding remote block: ${arg.name}`);
        const encoded = new TextEncoder().encode(arg.data);
        const fileName = `remotes/${arg.name}.local.bin`

        if(arg.skipRemoteSaving && checkedRemoteExistence.has(arg.name) === false){
            let fileExists = false;
            if(isTauri){
                fileExists = await exists(fileName, { baseDir: BaseDirectory.AppData });
            }
            else{
                const stored = await forageStorage.keys();
                if(stored.includes(fileName)){
                    fileExists = true;
                }
            }
            if(!fileExists){
                console.log(`Remote file ${fileName} does not exist, disabling skipRemoteSaving for this block.`);
                arg.skipRemoteSaving = false;
            }
            checkedRemoteExistence.add(arg.name);
        }

        if(!arg.skipRemoteSaving){
            if(isTauri){
                if(!(await exists('remotes', { baseDir: BaseDirectory.AppData }))){
                    await mkdir('remotes', { recursive: true, baseDir: BaseDirectory.AppData });
                }
                await writeFile(fileName, encoded!, { baseDir: BaseDirectory.AppData });
            }
            else{
                await forageStorage.setItem(fileName, encoded);
            }
        }
        return await this.encodeBlock({
            compression: false,
            data: JSON.stringify({
                v: 1,
                type: arg.type,
                name: arg.name,
            }),
            type: RisuSaveType.REMOTE,
            name: arg.name
        });
    }
}

export class RisuSaveDecoder {
    private blocks: {
        name: string;
        type: RisuSaveType;
        compression: boolean;
        content: string;
    }[] = []
    async decode(data: Uint8Array): Promise<DecodedRisuSave> {
        console.log('Decoding RisuSave data');
        let offset = magicRisuSaveHeader.length;
        //@ts-expect-error Database has required fields, but we initialize empty and populate incrementally during decode
        let db:Database = {}
        const kv: SaveKVData = {}
        const loadedBlocks = new Set<string>();
        while (offset < data.length) {
            try {
                const type = data[offset];
                const compression = data[offset + 1] === 1;
                offset += 2;

                const nameLength = data[offset];
                offset += 1;
                const name = new TextDecoder().decode(data.subarray(offset, offset + nameLength));
                offset += nameLength;

                const newArrayBuf = new ArrayBuffer(4);
                const lengthSubUint8Buf = data.slice(offset, offset + 4);
                new Uint8Array(newArrayBuf).set(lengthSubUint8Buf);
                const length = new Uint32Array(newArrayBuf)[0];
                offset += 4;

                let blockData = data.subarray(offset, offset + length);
                offset += length;

                if (compression) {
                    //decode using DecompressionStream
                    await checkCompressionStreams();
                    const cs = new DecompressionStream('gzip');
                    const writer = cs.writable.getWriter();
                    writer.write(blockData as any);
                    writer.close();
                    const buf = await new Response(cs.readable).arrayBuffer();
                    blockData = new Uint8Array(buf);
                }

                loadedBlocks.add(name);
                this.blocks.push({
                    name,
                    type,
                    compression,
                    content: new TextDecoder().decode(blockData)
                })   
            } catch (error) {
                continue
            }
        }
        console.log('blocks',this.blocks)
        let directory: string[] = []
        /** characters saved with CHARACTER_WITHOUT_CHAT + CHAT blocks, in block order */
        const splitCharacters: { character: any, chatIds: string[] }[] = []
        const chatRecords: ChatBlockPayload[] = []
        for(let i = 0; i < this.blocks.length; i++){
            const key = i;
            try {
                switch(this.blocks[key].type){
                    case RisuSaveType.ROOT:{
                        const rootData = JSON.parse(this.blocks[key].content);
                        for(const rootKey in rootData){
                            if(!db[rootKey] && !rootKey.startsWith('__')){
                                db[rootKey] = rootData[rootKey];
                            }
                            if(rootKey === '__directory'){
                                directory = rootData[rootKey];
                                console.log('RisuSave directory:', directory);
                                for(const dirKey of directory){
                                    if(!loadedBlocks.has(dirKey)){
                                        try {
                                            console.log(`Loading directory block ${dirKey} from cache`);
                                            const dirData:{
                                                type:RisuSaveType
                                                data:string
                                                name:string
                                            } = await risuSaveCacheForage.getItem(`risuSaveBlock_${dirKey}`) as any;

                                            if(dirData){
                                                this.blocks.push({
                                                    name: dirData.name,
                                                    type: dirData.type,
                                                    compression: false,
                                                    content: dirData.data
                                                });
                                                loadedBlocks.add(dirKey);
                                            }
                                        } catch (error) {
                                            console.error(`Error loading directory block ${dirKey}:`, error);
                                        }
                                    }
                                }
                            }
                        }
                        break;
                    }
                    case RisuSaveType.CHARACTER_WITH_CHAT:
                    case RisuSaveType.CHARACTER_WITHOUT_CHAT:{
                        db.characters ??= [];
                        const character = JSON.parse(this.blocks[key].content);
                        //a CHARACTER_WITHOUT_CHAT block with a chats array is a legacy full character
                        const chatIds = this.blocks[key].type === RisuSaveType.CHARACTER_WITHOUT_CHAT ? getSplitChatIds(character) : null;
                        if(chatIds){
                            //chats are attached after all blocks are read
                            character.chats = [];
                            splitCharacters.push({ character, chatIds });
                        }
                        db.characters.push(character);
                        break
                    }
                    case RisuSaveType.CHAT:{
                        const payload:ChatBlockPayload = JSON.parse(this.blocks[key].content);
                        if(
                            !payload || typeof payload.chaId !== 'string' || typeof payload.chatId !== 'string' ||
                            !payload.chat || typeof payload.chat !== 'object' || Array.isArray(payload.chat)
                        ){
                            console.warn(`Invalid chat block ${this.blocks[key].name}, ignoring.`);
                            break;
                        }
                        chatRecords.push(payload);
                        break;
                    }
                    case RisuSaveType.BOTPRESET:{
                        db.botPresets = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.MODULES:{
                        db.modules = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.CONFIG:{
                        //ignore for now
                        break;
                    }
                    case RisuSaveType.PLUGINS:{
                        db.plugins = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.LOADOUTS:{
                        db.loadouts = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.PLUGIN_STORAGE:{
                        db.pluginCustomStorage = JSON.parse(this.blocks[key].content);
                        break;
                    }
                    case RisuSaveType.KV:{
                        const name = this.blocks[key].name;
                        if(name.startsWith(KV_BLOCK_PREFIX)){
                            kv[name.slice(KV_BLOCK_PREFIX.length)] = JSON.parse(this.blocks[key].content);
                        }
                        break;
                    }
                    case RisuSaveType.REMOTE:{
                        const remoteInfo:{
                            v:number
                            type:RisuSaveType
                            name:string
                        } = JSON.parse(this.blocks[key].content);
                        const fileName = `remotes/${remoteInfo.name}.local.bin`
                        let remoteData:Uint8Array|null = null
                        if(isTauri){
                            try {
                                if(await exists(fileName, { baseDir: BaseDirectory.AppData })){
                                    remoteData = await readFile(fileName, { baseDir: BaseDirectory.AppData });
                                }
                            } catch (error) {
                                console.error(`Error reading remote file ${fileName} in Tauri:`, error);
                            }
                        }
                        else{
                            const stored = await forageStorage.getItem(fileName);
                            if(stored){
                                remoteData = stored as Uint8Array;
                            }
                        }

                        if(!remoteData){
                            console.warn(`Remote file ${fileName} not found.`);
                            break;
                        }
                        const decoded = new TextDecoder().decode(remoteData)

                        //add to blocks for further processing
                        this.blocks.push({
                            name: remoteInfo.name,
                            type: remoteInfo.type,
                            compression: false,
                            content: decoded
                        });
                        break;
                    }
                    case RisuSaveType.ROOT_COMPONENT:{
                        const componentData:{
                            data:any
                            key:string
                        } = JSON.parse(this.blocks[key].content);
                        db[componentData.key] = componentData.data;
                        break;
                    }
                    default:{
                        console.warn(`Not Implemented RisuSaveType: ${this.blocks[key].type} for ${this.blocks[key].name}`);
                    }
                }   
            } catch (error) {
                console.error(`Error processing block ${this.blocks[key].name}:`, error);

                if(this.blocks[key].type === RisuSaveType.ROOT){
                    throw new Error('Failed to decode root block, cannot proceed with decoding RisuSave data');
                }
            }
        }
        attachSplitChats(db, splitCharacters, chatRecords)
        //to fix botpreset bugs
        if(!Array.isArray(db.botPresets) || db.botPresets.length === 0){
            db.botPresets = [presetTemplate]
            db.botPresetsId = 0
        }
        console.log('Decoded RisuSave data', db);
        return { database: db, kv };
    }
}

/**
 * Attaches decoded CHAT blocks to their split characters, in the recorded order.
 * Missing chats become placeholders, unlisted chats of an existing character are appended,
 * chats of a character that does not exist are dropped.
 */
function attachSplitChats(db:Database, splitCharacters:{ character: any, chatIds: string[] }[], chatRecords:ChatBlockPayload[]){
    if(splitCharacters.length === 0 && chatRecords.length === 0){
        return
    }
    const recordsByCharacter = new Map<string, ChatBlockPayload[]>()
    for(const record of chatRecords){
        if(!recordsByCharacter.has(record.chaId)){
            recordsByCharacter.set(record.chaId, [])
        }
        recordsByCharacter.get(record.chaId).push(record)
    }
    const used = new Set<ChatBlockPayload>()
    const takeChat = (record:ChatBlockPayload) => {
        if(used.has(record)){
            //only possible with duplicated chaIds; give each character its own copy
            return JSON.parse(JSON.stringify(record.chat))
        }
        used.add(record)
        return record.chat
    }

    for(const { character, chatIds } of splitCharacters){
        const records = recordsByCharacter.get(character.chaId) ?? []
        const takenHere = new Set<ChatBlockPayload>()
        const chats:any[] = []
        for(const chatId of chatIds){
            const record = records.find((r) => r.chatId === chatId && !takenHere.has(r))
            if(record){
                takenHere.add(record)
                const chat = takeChat(record)
                chat.id ??= chatId
                chats.push(chat)
            }
            else{
                console.error(`Chat block ${chatId} of character ${character.chaId} is missing, inserting a placeholder.`)
                chats.push(makeMissingChatPlaceholder(chatId))
            }
        }
        character.chats = chats
    }

    //chat blocks that are not in the order list of their character
    for(const record of chatRecords){
        if(used.has(record)){
            continue
        }
        const parent = (db.characters ?? []).find((c) => c?.chaId === record.chaId)
        if(!parent){
            console.warn(`Discarding chat ${record.chatId}: character ${record.chaId} does not exist.`)
            continue
        }
        if(!Array.isArray(parent.chats)){
            parent.chats = []
        }
        if(parent.chats.some((c) => c?.id === record.chatId)){
            //a legacy character already holding this chat
            continue
        }
        console.warn(`Recovering chat ${record.chatId} of character ${record.chaId} that is not in its chat list.`)
        used.add(record)
        record.chat.id ??= record.chatId
        parent.chats.push(record.chat)
    }

    for(const { character } of splitCharacters){
        const page = character.chatPage
        if(character.chats.length > 0 && !(Number.isInteger(page) && page >= 0 && page < character.chats.length)){
            character.chatPage = 0
        }
    }
}

export type DecodedRisuSave = {
    database: Database
    /** SaveKV namespaces stored in the save (empty for formats older than RisuSave blocks) */
    kv: SaveKVData
}

/**
 * Decodes any save format. Returns the database and the SaveKV data separately;
 * the caller decides whether they become live (setDatabase + saveKV.load).
 */
export async function decodeRisuSave(data:Uint8Array): Promise<DecodedRisuSave>{
    const header = checkHeader(data)
    if(header === 'risusave'){
        try {
            const decoder = new RisuSaveDecoder();
            return await decoder.decode(data);
        } catch (error) {
            //kept from the original decoder: a failed RisuSave decode still tries the legacy fallbacks
            console.error('Error decoding RisuSave data:', error);
            return { database: await decodeFallback(data), kv: {} }
        }
    }
    return { database: await decodeLegacyRisuSave(data, header), kv: {} }
}

async function decodeLegacyRisuSave(data:Uint8Array, header:ReturnType<typeof checkHeader>){
    try {
        switch(header){
            case "compressed":
                data = data.slice(magicCompressedHeader.length)
                return decode(fflate.decompressSync(data))
            case "raw":
                data = data.slice(magicHeader.length)
                return unpackr.decode(data)
            case "stream":{
                await checkCompressionStreams()
                data = data.slice(magicStreamCompressedHeader.length)
                const cs = new DecompressionStream('gzip');
                const writer = cs.writable.getWriter();
                writer.write(data as any);
                writer.close();
                const buf = await new Response(cs.readable).arrayBuffer()
                return unpackr.decode(new Uint8Array(buf))
            }
        }
        return unpackr.decode(data)
    }
    catch (error) {
        console.error('Error decoding RisuSave data:', error);
        //data may already be sliced past the header here, as before
        return await decodeFallback(data)
    }
}

/** last-resort decoders for older/odd save formats */
async function decodeFallback(data:Uint8Array){
    try {
        console.log('risudecode')
        const risuSaveHeader = new Uint8Array(Buffer.from("\u0000\u0000RISU",'utf-8'))
        const realData = data.subarray(risuSaveHeader.length)
        const dec = unpackr.decode(realData)
        return dec
    } catch (error) {
        const buf = Buffer.from(fflate.decompressSync(Buffer.from(data)))
        try {
            return JSON.parse(buf.toString('utf-8'))
        } catch (error) {
            return unpackr.decode(buf)
        }
    }
}

/**
 * Encodes a complete, self-contained save file in the RisuSave block format (backups, exports, migrations).
 * Never writes remote block files or the local block cache.
 */
export async function encodeRisuSave(data:Database|Record<string, never>, arg:{
    compression?: boolean,
    kv?: SaveKVSource | null
} = {}): Promise<Uint8Array>{
    const encoder = new RisuSaveEncoder({ remote: false, cache: false });
    await encoder.init(data as Database, {
        compression: arg.compression ?? false,
        kv: arg.kv ?? null
    });
    return new Uint8Array(encoder.encode());
}

function checkHeader(data: Uint8Array) {

    let header:'none'|'compressed'|'raw'|'stream'|'risusave' = 'raw'

    if (data.length < magicHeader.length) {
      return false;
    }
  
    for (let i = 0; i < magicHeader.length; i++) {
      if (data[i] !== magicHeader[i]) {
        header = 'none'
        break
      }
    }

    if(header === 'none'){
        header = 'compressed'
        for (let i = 0; i < magicCompressedHeader.length; i++) {
            if (data[i] !== magicCompressedHeader[i]) {
                header = 'none'
                break
            }
        }
    }

    if(header === 'none'){
        header = 'stream'
        for (let i = 0; i < magicStreamCompressedHeader.length; i++) {
            if (data[i] !== magicStreamCompressedHeader[i]) {
                header = 'none'
                break
            }
        }
    }

    if(header === 'none'){
        header = 'risusave'
        for (let i = 0; i < magicRisuSaveHeader.length; i++) {
            if (data[i] !== magicRisuSaveHeader[i]) {
                header = 'none'
                break
            }
        }
    }

    // All bytes matched
    return header;
  }