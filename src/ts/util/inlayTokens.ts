export const inlayTokenRegex = /{{(inlay|inlayed|inlayeddata)::(.+?)}}/g;

export function extractInlayIdsFromText(text: string) {
    const ids: string[] = [];
    if (!text) {
        return ids;
    }
    text.replace(inlayTokenRegex, (_match, _type, id: string) => {
        if (id) {
            ids.push(id);
        }
        return "";
    });
    return ids;
}

export function extractInlayIdsFromMessages(messages: Array<{ data: string }>) {
    const ids = new Set<string>();
    for (const message of messages) {
        const found = extractInlayIdsFromText(message?.data ?? "");
        for (const id of found) {
            ids.add(id);
        }
    }
    return ids;
}
