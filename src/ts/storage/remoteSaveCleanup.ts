export const remoteSavePayloadExtension = '.local.bin'
export const remoteSaveCleanupGraceMs = 1000 * 60 * 60 * 24 * 7

export type RemoteSaveCleanupAction = 'ignore' | 'keep' | 'create-meta' | 'delete'

export function getRemoteSavePayloadName(fileName:string){
    if(!fileName.endsWith(remoteSavePayloadExtension)){
        return null
    }
    return fileName.slice(0, -remoteSavePayloadExtension.length)
}

export function getRemoteSaveCleanupAction(arg:{
    fileName:string
    activeCharacterIds:Set<string>
    hasMeta:boolean
    metaLastUsed?:unknown
    now?:number
}):RemoteSaveCleanupAction{
    const payloadName = getRemoteSavePayloadName(arg.fileName)
    if(!payloadName){
        return 'ignore'
    }
    if(arg.activeCharacterIds.has(payloadName)){
        return 'keep'
    }
    if(!arg.hasMeta){
        return 'create-meta'
    }
    if(
        typeof arg.metaLastUsed === 'number' &&
        Number.isFinite(arg.metaLastUsed) &&
        (arg.now ?? Date.now()) - arg.metaLastUsed > remoteSaveCleanupGraceMs
    ){
        return 'delete'
    }
    return 'keep'
}
