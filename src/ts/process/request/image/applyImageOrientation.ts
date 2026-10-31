export type ImageOrientation = 'landscape' | 'portrait'

/**
 * Places the longer edge on the width for landscape and on the height for portrait.
 */
export function applyImageOrientation(width: number, height: number, orientation?: ImageOrientation) {
    if (!orientation) {
        return { height, width }
    }

    const longerEdge = Math.max(height, width)
    const shorterEdge = Math.min(height, width)

    if (orientation === 'landscape') {
        return {
            height: shorterEdge,
            width: longerEdge,
        }
    }

    return {
        height: longerEdge,
        width: shorterEdge,
    }
}
