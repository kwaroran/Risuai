import { DBState } from "../stores.svelte";

export type ImageType = "JPEG" | "PNG" | "GIF" | "BMP" | "AVIF" | "WEBP" | "Unknown";

export type ImageConversionResult = {
    data: Uint8Array;
    ext: string;
    mime: string;
    width: number;
    height: number;
};

const defaultMaxSize = 3000;
const defaultQuality = 0.75;

export function checkImageType(arr: Uint8Array): ImageType {
    const isJPEG = arr[0] === 0xff && arr[1] === 0xd8 && arr[arr.length - 2] === 0xff && arr[arr.length - 1] === 0xd9;
    const isPNG = arr[0] === 0x89 && arr[1] === 0x50 && arr[2] === 0x4e && arr[3] === 0x47 && arr[4] === 0x0d && arr[5] === 0x0a && arr[6] === 0x1a && arr[7] === 0x0a;
    const isGIF = arr[0] === 0x47 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x38 && (arr[4] === 0x37 || arr[4] === 0x39) && arr[5] === 0x61;
    const isBMP = arr[0] === 0x42 && arr[1] === 0x4d;
    const isAVIF = arr[4] === 0x66 && arr[5] === 0x74 && arr[6] === 0x79 && arr[7] === 0x70 && arr[8] === 0x61 && arr[9] === 0x76 && arr[10] === 0x69 && arr[11] === 0x66;
    const isWEBP = arr[0] === 0x52 && arr[1] === 0x49 && arr[2] === 0x46 && arr[3] === 0x46 && arr[8] === 0x57 && arr[9] === 0x45 && arr[10] === 0x42 && arr[11] === 0x50;

    if (isJPEG) return "JPEG";
    if (isPNG) return "PNG";
    if (isGIF) return "GIF";
    if (isBMP) return "BMP";
    if (isAVIF) return "AVIF";
    if (isWEBP) return "WEBP";
    return "Unknown";
}

export function extFromImageType(type: ImageType, fallbackExt = "png") {
    switch (type) {
        case "JPEG":
            return "jpeg";
        case "PNG":
            return "png";
        case "GIF":
            return "gif";
        case "BMP":
            return "bmp";
        case "AVIF":
            return "avif";
        case "WEBP":
            return "webp";
        default:
            return fallbackExt;
    }
}

export function mimeFromExt(ext: string) {
    const normalized = (ext ?? "").toLowerCase();
    switch (normalized) {
        case "jpeg":
        case "jpg":
            return "image/jpeg";
        case "png":
            return "image/png";
        case "gif":
            return "image/gif";
        case "webp":
            return "image/webp";
        case "avif":
            return "image/avif";
        case "bmp":
            return "image/bmp";
        default:
            return "application/octet-stream";
    }
}

function normalizeOriginalExt(data: Uint8Array, originalExt?: string) {
    if (originalExt && originalExt !== "unknown") {
        return originalExt;
    }
    return extFromImageType(checkImageType(data), "png");
}

export async function encodeCanvasToImage(
    canvas: HTMLCanvasElement,
    arg: { quality?: number; preferWebp?: boolean; fallback?: "jpeg" | "png" } = {}
): Promise<ImageConversionResult> {
    const quality = arg.quality ?? defaultQuality;
    const preferWebp = arg.preferWebp ?? true;
    const fallback = arg.fallback ?? "jpeg";

    let dataUrl = "";
    let ext = "";
    let mime = "";

    if (preferWebp) {
        dataUrl = canvas.toDataURL("image/webp", quality);
        if (dataUrl.startsWith("data:image/webp")) {
            ext = "webp";
            mime = "image/webp";
        }
    }

    if (!ext) {
        if (fallback === "png") {
            dataUrl = canvas.toDataURL("image/png");
            ext = "png";
            mime = "image/png";
        } else {
            dataUrl = canvas.toDataURL("image/jpeg", quality);
            if (!dataUrl.startsWith("data:image/jpeg")) {
                dataUrl = canvas.toDataURL("image/png");
                ext = "png";
                mime = "image/png";
            } else {
                ext = "jpeg";
                mime = "image/jpeg";
            }
        }
    }

    const data = Buffer.from(dataUrl.split(",")[1] ?? "", "base64");
    return {
        data,
        ext,
        mime,
        width: canvas.width,
        height: canvas.height
    };
}

export async function convertImageWithMeta(
    data: Uint8Array,
    arg: { originalExt?: string; maxSize?: number; quality?: number } = {}
): Promise<ImageConversionResult> {
    const originalExt = normalizeOriginalExt(data, arg.originalExt);
    const originalMime = mimeFromExt(originalExt);
    const shouldCompress = DBState?.db?.imageCompression ?? false;

    if (!shouldCompress) {
        return {
            data,
            ext: originalExt,
            mime: originalMime,
            width: 0,
            height: 0
        };
    }

    const detectedType = checkImageType(data);
    if (detectedType === "Unknown" || detectedType === "WEBP" || detectedType === "AVIF") {
        return {
            data,
            ext: originalExt,
            mime: originalMime,
            width: 0,
            height: 0
        };
    }

    if (typeof Image === "undefined" || typeof document === "undefined") {
        return {
            data,
            ext: originalExt,
            mime: originalMime,
            width: 0,
            height: 0
        };
    }

    const base64Image = `data:${originalMime};base64,${Buffer.from(data).toString("base64")}`;
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to load image for conversion."));
        image.src = base64Image;
    });

    let { width, height } = image;
    const maxSize = arg.maxSize ?? defaultMaxSize;
    if (width > maxSize || height > maxSize) {
        const aspectRatio = width / height;
        if (width > height) {
            width = maxSize;
            height = Math.round(width / aspectRatio);
        } else {
            height = maxSize;
            width = Math.round(height * aspectRatio);
        }
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
        throw new Error("Unable to get 2D context for conversion.");
    }
    context.drawImage(image, 0, 0, width, height);

    const converted = await encodeCanvasToImage(canvas, {
        quality: arg.quality,
        preferWebp: true,
        fallback: "jpeg"
    });

    return {
        ...converted,
        width,
        height
    };
}

export async function convertImage(
    data: Uint8Array,
    arg: { originalExt?: string; maxSize?: number; quality?: number } = {}
) {
    const converted = await convertImageWithMeta(data, arg);
    return converted.data;
}
