import { alertStore } from "../../alert";
import { LocalWriter } from "../../globalApi.svelte";
import { CharXWriter } from "../processzip";
import { getInlayAssetBlob } from "./inlays";

export type RisuChatZipManifest = {
    type: "risuChatZip"
    ver: 1
    chatFile: "chat.json"
    inlaysDir: "inlays/"
    inlays: Record<
        string,
        {
            file: string
            ext: string
            type: "image" | "audio" | "video"
            name?: string
            width?: number
            height?: number
        }
    >
}

function normalizeExt(ext?: string) {
    const lowered = (ext ?? "").replace(/^\./, "").toLowerCase()
    return lowered || "png"
}

export async function exportChatZipWithInlays(arg: {
    baseName: string
    payload: unknown
    inlayIds: Iterable<string>
}): Promise<{ canceled: boolean; missingInlays: string[] }> {
    const localWriter = new LocalWriter()
    const ok = await localWriter.init(arg.baseName, ["zip"])
    if (!ok) {
        return { canceled: true, missingInlays: [] }
    }

    const writer = new CharXWriter(localWriter)
    await writer.init()

    const manifest: RisuChatZipManifest = {
        type: "risuChatZip",
        ver: 1,
        chatFile: "chat.json",
        inlaysDir: "inlays/",
        inlays: {}
    }

    alertStore.set({
        type: "wait",
        msg: "Exporting... (Writing chat.json)"
    })
    await writer.write("chat.json", JSON.stringify(arg.payload, null, 2))

    const missingInlays: string[] = []
    const ids = Array.from(new Set(Array.from(arg.inlayIds).filter(Boolean)))

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        alertStore.set({
            type: "wait",
            msg: `Exporting... (Inlays ${i + 1} / ${ids.length})`
        })

        try {
            const asset = await getInlayAssetBlob(id)
            if (!asset?.data) {
                missingInlays.push(id)
                continue
            }

            const ext = normalizeExt(asset.ext)
            const zipPath = `inlays/${id}.${ext}`
            const bytes = new Uint8Array(await asset.data.arrayBuffer())
            await writer.write(zipPath, bytes)
            manifest.inlays[id] = {
                file: zipPath,
                ext,
                type: asset.type,
                name: asset.name,
                width: asset.width,
                height: asset.height
            }
        } catch (_error) {
            missingInlays.push(id)
        }
    }

    alertStore.set({
        type: "wait",
        msg: "Exporting... (Writing manifest.json)"
    })
    await writer.write("manifest.json", JSON.stringify(manifest, null, 2))
    await writer.end()

    return { canceled: false, missingInlays }
}

