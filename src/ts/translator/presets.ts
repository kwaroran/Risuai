import { decode as decodeMsgpack, encode as encodeMsgpack } from "msgpackr/index-no-eval";
import * as fflate from "fflate";
import { decryptBuffer, encryptBuffer } from "src/ts/util";
import { decodeRPack, encodeRPack } from "src/ts/rpack/rpack_js.js";

export interface TranslatorPreset {
    name: string;
    prompt: string;
    maxResponse: number;
}

export interface TranslatorPresetStateLike {
    translatorPrompt?: string;
    translatorMaxResponse?: number;
    translatorPresets?: unknown[];
    translatorPresetId?: number;
}

interface EncryptedTranslatorPresetFile {
    translatorPresetVersion: 1;
    type: "translator-preset";
    preset: Uint8Array | ArrayBuffer;
}

export const defaultTranslatorPrompt =
    "You are a translator. translate the following html or text into {{slot}}. do not output anything other than the translation.";
export const translatorPresetFileExtension = "risutl";
export const translatorPresetImportExtensions = [translatorPresetFileExtension];
const translatorPresetEncryptionKey = "risutl";

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function isTranslatorPresetValue(value: unknown): value is TranslatorPreset {
    return (
        isRecord(value) &&
        typeof value.name === "string" &&
        typeof value.prompt === "string" &&
        typeof value.maxResponse === "number" &&
        Number.isFinite(value.maxResponse)
    );
}

function getBytes(value: unknown): Uint8Array | null {
    if (value instanceof Uint8Array) {
        return value;
    }

    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value);
    }

    if (ArrayBuffer.isView(value)) {
        return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }

    return null;
}

function isEncryptedTranslatorPresetFile(value: unknown): value is EncryptedTranslatorPresetFile {
    return (
        isRecord(value) &&
        value.translatorPresetVersion === 1 &&
        value.type === "translator-preset" &&
        getBytes(value.preset) !== null
    );
}

function getDefaultTranslatorPreset(state: TranslatorPresetStateLike): TranslatorPreset {
    return createTranslatorPreset("Default", {
        prompt: state.translatorPrompt ?? "",
        maxResponse: state.translatorMaxResponse ?? 1000,
    });
}

function getNormalizedTranslatorPresetName(name: unknown, index: number): string {
    if (typeof name === "string" && name.trim().length > 0) {
        return name;
    }

    return `Preset ${index + 1}`;
}

function sanitizeFileNamePart(value: string): string {
    const sanitized = value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").trim();
    return sanitized.length > 0 ? sanitized : "preset";
}

export function createTranslatorPreset(
    name = "New Preset",
    existing: Partial<TranslatorPreset> = {}
): TranslatorPreset {
    return {
        name,
        prompt: typeof existing.prompt === "string" ? existing.prompt : "",
        maxResponse:
            typeof existing.maxResponse === "number" && Number.isFinite(existing.maxResponse)
                ? existing.maxResponse
                : 1000,
    };
}

export function normalizeTranslatorPresetState<T extends TranslatorPresetStateLike>(state: T): T {
    const defaultPreset = getDefaultTranslatorPreset(state);
    const sourcePresets =
        Array.isArray(state.translatorPresets) && state.translatorPresets.length > 0
            ? state.translatorPresets
            : [defaultPreset];

    state.translatorPresets = sourcePresets.map((preset, index) => {
        const normalizedPreset = isRecord(preset) ? preset : {};
        return createTranslatorPreset(
            getNormalizedTranslatorPresetName(normalizedPreset.name, index),
            normalizedPreset
        );
    });

    const requestedId =
        typeof state.translatorPresetId === "number" && Number.isInteger(state.translatorPresetId)
            ? state.translatorPresetId
            : 0;

    state.translatorPresetId = Math.min(
        Math.max(requestedId, 0),
        Math.max(state.translatorPresets.length - 1, 0)
    );

    return syncCurrentTranslatorPresetToLegacyFields(state);
}

export function syncCurrentTranslatorPresetToLegacyFields<T extends TranslatorPresetStateLike>(
    state: T
): T {
    const preset = state.translatorPresets?.[state.translatorPresetId ?? 0];

    if (!isTranslatorPresetValue(preset)) {
        return normalizeTranslatorPresetState(state);
    }

    state.translatorPrompt = preset.prompt;
    state.translatorMaxResponse = preset.maxResponse;

    return state;
}

export function getCurrentTranslatorPresetFromState<T extends TranslatorPresetStateLike>(
    state: T
): TranslatorPreset {
    const presetId =
        typeof state.translatorPresetId === "number" && Number.isInteger(state.translatorPresetId)
            ? state.translatorPresetId
            : -1;
    const preset = Array.isArray(state.translatorPresets) ? state.translatorPresets[presetId] : undefined;

    if (!isTranslatorPresetValue(preset)) {
        const normalizedState = normalizeTranslatorPresetState(state);
        const normalizedPreset =
            normalizedState.translatorPresets?.[normalizedState.translatorPresetId ?? 0];
        return isTranslatorPresetValue(normalizedPreset)
            ? normalizedPreset
            : getDefaultTranslatorPreset(normalizedState);
    }

    state.translatorPrompt = preset.prompt;
    state.translatorMaxResponse = preset.maxResponse;

    return preset;
}

async function decodeEncryptedTranslatorPresetFile(data: Uint8Array): Promise<TranslatorPreset> {
    let encodedPreset: Uint8Array;
    try {
        encodedPreset = await decodeRPack(data);
    } catch {
        throw new Error("Invalid translator preset file.");
    }

    let decodedContainer: unknown;

    try {
        decodedContainer = decodeMsgpack(fflate.decompressSync(encodedPreset));
    } catch {
        throw new Error("Invalid translator preset file.");
    }

    if (!isEncryptedTranslatorPresetFile(decodedContainer)) {
        throw new Error("Invalid translator preset file.");
    }

    const encryptedPreset = getBytes(decodedContainer.preset);

    if (!encryptedPreset) {
        throw new Error("Invalid translator preset file.");
    }

    let decryptedPreset: ArrayBuffer;

    try {
        decryptedPreset = await decryptBuffer(encryptedPreset, translatorPresetEncryptionKey);
    } catch {
        throw new Error("Invalid translator preset file.");
    }

    const parsedPreset: unknown = decodeMsgpack(new Uint8Array(decryptedPreset));

    if (!isTranslatorPresetValue(parsedPreset)) {
        throw new Error("Invalid translator preset file.");
    }

    return createTranslatorPreset(
        parsedPreset.name.trim().length > 0 ? parsedPreset.name : "Imported Preset",
        parsedPreset
    );
}

export async function encodeTranslatorPresetFile(preset: TranslatorPreset): Promise<Uint8Array> {
    const normalizedPreset = createTranslatorPreset(
        preset.name.trim().length > 0 ? preset.name : "Preset",
        preset
    );
    const encryptedPreset = new Uint8Array(
        await encryptBuffer(encodeMsgpack(normalizedPreset), translatorPresetEncryptionKey)
    );
    const payload: EncryptedTranslatorPresetFile = {
        translatorPresetVersion: 1,
        type: "translator-preset",
        preset: encryptedPreset,
    };

    return await encodeRPack(fflate.compressSync(encodeMsgpack(payload)));
}

export async function decodeTranslatorPresetFile(data: Uint8Array): Promise<TranslatorPreset> {
    return await decodeEncryptedTranslatorPresetFile(data);
}

export function getTranslatorPresetDownloadName(name: string): string {
    return `translator_preset_${sanitizeFileNamePart(name)}.${translatorPresetFileExtension}`;
}
