// Only 20 lines, lol

import fileBufferUrl from './rpack_map.bin?url';

let mapData;
let encodeMap;
let decodeMap;

export async function initRPack() {
    if(mapData) return; // Already initialized
    const response = await fetch(fileBufferUrl);
    const arrayBuffer = await response.arrayBuffer();
    mapData = new Uint8Array(arrayBuffer);
    encodeMap = mapData.slice(0, 256);
    decodeMap = mapData.slice(256, 512);
}

export async function encodeRPack(data) {
    await initRPack();
    let result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        result[i] = encodeMap[data[i]];
    }
    return result;
}
export async function decodeRPack(data) {
    await initRPack();
    let result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        result[i] = decodeMap[data[i]];
    }
    return result;
}