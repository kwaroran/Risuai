// Only 20 lines, lol

import fileBuffer from './rpack_map.bin?arraybuffer';

const mapData = new Uint8Array(fileBuffer);
const encodeMap = mapData.slice(0, 256);
const decodeMap = mapData.slice(256, 512);

export async function encodeRPack(data) {
    let result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        result[i] = encodeMap[data[i]];
    }
    return result;
}
export async function decodeRPack(data) {
    let result = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        result[i] = decodeMap[data[i]];
    }
    return result;
}