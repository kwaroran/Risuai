/**
 * Backdrop art for the Aurora theme.
 *
 * A small sky scene is painted at one pixel per halftone cell, then rebuilt at full
 * resolution as a halftone: every cell becomes a dot whose size follows how much of
 * the scene shows there. Toward the bottom the dots shrink and scatter, so the art
 * dissolves into the page color like mist.
 *
 * Dark color schemes get a night sky with aurora curtains; light ones a dawn sky
 * with pink clouds.
 */

export interface AuroraArtOptions {
    /** Size in CSS pixels */
    width: number
    height: number
    dark: boolean
    /** Halftone cell size in CSS pixels */
    cell?: number
    pixelRatio?: number
    seed?: number
}

/** Small deterministic PRNG so the art stays the same between renders */
export function createRng(seed: number): () => number {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) >>> 0
        let t = a
        t = Math.imul(t ^ (t >>> 15), t | 1)
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function clamp01(value: number): number {
    return value < 0 ? 0 : value > 1 ? 1 : value
}

function smoothstep(edge0: number, edge1: number, value: number): number {
    const t = clamp01((value - edge0) / (edge1 - edge0))
    return t * t * (3 - 2 * t)
}

/**
 * Dot radius for a halftone cell. Full coverage fills the whole cell (the radius
 * reaches past the cell corners), and very low coverage drops the dot.
 */
export function halftoneRadius(coverage: number, cell: number): number {
    const c = clamp01(coverage)
    if (c < 0.03) {
        return 0
    }
    return 0.74 * cell * Math.sqrt(c)
}

/**
 * How much of the art survives at a height, from 1 at the top to 0 at the bottom.
 * `noise` (about -1..1) pushes the edge up or down so it breaks up like clouds.
 */
export function mistFade(yRatio: number, noise = 0): number {
    return 1 - smoothstep(0.22, 0.9, yRatio + noise * 0.14)
}

/** Cheap smooth noise, about -1..1 */
function waveNoise(x: number, y: number, phase: number): number {
    return (
        Math.sin(x * 0.021 + phase) * 0.5 +
        Math.sin(y * 0.034 - x * 0.013 + phase * 1.7) * 0.3 +
        Math.sin((x + y) * 0.071 + phase * 2.3) * 0.2
    )
}

function paintNightSky(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) {
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#0b1033')
    sky.addColorStop(0.55, '#171c4f')
    sky.addColorStop(1, '#2a1a4d')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    const curtains = document.createElement('canvas')
    curtains.width = w
    curtains.height = h
    const cc = curtains.getContext('2d')
    if (!cc) {
        return
    }
    cc.globalCompositeOperation = 'lighter'
    const ribbons = [
        { base: 0.5, amp: 0.1, freq: 1.1, height: 0.42, low: [52, 211, 153], high: [56, 189, 248] },
        { base: 0.36, amp: 0.08, freq: 1.7, height: 0.3, low: [45, 212, 191], high: [167, 139, 250] },
        { base: 0.62, amp: 0.07, freq: 2.3, height: 0.36, low: [134, 239, 172], high: [244, 114, 182] },
    ]
    for (const ribbon of ribbons) {
        const phase = rnd() * Math.PI * 2
        const phase2 = rnd() * Math.PI * 2
        for (let x = 0; x < w; x++) {
            const u = x / w
            const y0 = h * (ribbon.base + ribbon.amp * Math.sin(u * Math.PI * 2 * ribbon.freq + phase) + ribbon.amp * 0.5 * Math.sin(u * Math.PI * 2 * ribbon.freq * 2.7 + phase2))
            const glow = 0.35 + 0.65 * Math.sin(u * Math.PI * 5 + phase2) ** 2
            const hh = h * ribbon.height * (0.55 + 0.45 * Math.sin(u * Math.PI * 3 + phase) ** 2)
            const g = cc.createLinearGradient(0, y0 + 3, 0, y0 - hh)
            const [lr, lg, lb] = ribbon.low
            const [hr, hg, hb] = ribbon.high
            g.addColorStop(0, `rgba(${lr},${lg},${lb},0)`)
            g.addColorStop(0.08, `rgba(${lr},${lg},${lb},${0.95 * glow})`)
            g.addColorStop(0.45, `rgba(${hr},${hg},${hb},${0.45 * glow})`)
            g.addColorStop(1, `rgba(${hr},${hg},${hb},0)`)
            cc.fillStyle = g
            cc.fillRect(x, y0 - hh, 1, hh + 3)
        }
    }
    ctx.save()
    ctx.filter = 'blur(1.2px)'
    ctx.globalCompositeOperation = 'lighter'
    ctx.drawImage(curtains, 0, 0)
    ctx.restore()

    // A scattering of stars in the upper sky
    const stars = Math.round(w * h * 0.004)
    for (let i = 0; i < stars; i++) {
        const sx = Math.floor(rnd() * w)
        const sy = Math.floor(rnd() * h * 0.6)
        ctx.fillStyle = `rgba(255,255,255,${0.35 + rnd() * 0.6})`
        ctx.fillRect(sx, sy, 1, 1)
    }
}

function paintDawnSky(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: () => number) {
    const sky = ctx.createLinearGradient(0, 0, 0, h)
    sky.addColorStop(0, '#5574e6')
    sky.addColorStop(0.45, '#8ea5f4')
    sky.addColorStop(0.75, '#e6c3e6')
    sky.addColorStop(1, '#f7dfe8')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, w, h)

    // Clouds bank up on both sides and leave the middle open, framing the content
    const unit = Math.min(w, h * 2)
    const puff = (x: number, y: number, r: number, color: string) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, color)
        g.addColorStop(0.6, color.replace(/[\d.]+\)$/, '0.55)'))
        g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'))
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
    }
    const clusters = 9
    for (let i = 0; i < clusters; i++) {
        const side = i % 2 === 0 ? rnd() * 0.3 : 0.7 + rnd() * 0.3
        const cx = w * side
        const cy = h * (0.05 + rnd() * 0.6)
        const size = unit * (0.06 + rnd() * 0.08)
        const puffs = 10 + Math.floor(rnd() * 8)
        for (let p = 0; p < puffs; p++) {
            const px = cx + (rnd() - 0.5) * size * 3
            const py = cy + (rnd() - 0.5) * size * 1.2
            const pr = size * (0.4 + rnd() * 0.7)
            puff(px - pr * 0.25, py + pr * 0.3, pr, 'rgba(150,120,225,0.55)')
            puff(px, py, pr * 0.9, 'rgba(249,168,212,0.8)')
            puff(px + pr * 0.2, py - pr * 0.25, pr * 0.6, 'rgba(255,240,230,0.9)')
        }
    }
    // Thin wisps across the open middle
    for (let i = 0; i < 14; i++) {
        const y = h * (0.08 + rnd() * 0.45)
        const x = w * (0.2 + rnd() * 0.6)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate((rnd() - 0.5) * 0.5)
        ctx.scale(1, 0.18)
        puff(0, 0, unit * (0.05 + rnd() * 0.07), 'rgba(255,225,240,0.55)')
        ctx.restore()
    }
}

/**
 * Renders the art to a canvas at `pixelRatio` resolution.
 * Pixels outside the dots stay transparent so the page color shows through.
 */
export function renderAuroraArt(options: AuroraArtOptions): HTMLCanvasElement {
    const cell = options.cell ?? 4
    const ratio = Math.max(1, Math.min(options.pixelRatio ?? 1, 2))
    const cols = Math.max(1, Math.ceil(options.width / cell))
    const rows = Math.max(1, Math.ceil(options.height / cell))
    const rnd = createRng(options.seed ?? 20261121)

    const scene = document.createElement('canvas')
    scene.width = cols
    scene.height = rows
    const sctx = scene.getContext('2d', { willReadFrequently: true })
    const out = document.createElement('canvas')
    const cellPx = Math.round(cell * ratio)
    out.width = cols * cellPx
    out.height = rows * cellPx
    const octx = out.getContext('2d')
    if (!sctx || !octx) {
        return out
    }
    if (options.dark) {
        paintNightSky(sctx, cols, rows, rnd)
    }
    else {
        paintDawnSky(sctx, cols, rows, rnd)
    }

    const src = sctx.getImageData(0, 0, cols, rows).data
    const image = octx.createImageData(out.width, out.height)
    const dst = image.data
    const phase = rnd() * 10
    const half = cellPx / 2
    for (let cy = 0; cy < rows; cy++) {
        const yRatio = (cy + 0.5) / rows
        for (let cx = 0; cx < cols; cx++) {
            const si = (cy * cols + cx) * 4
            const r = src[si]
            const g = src[si + 1]
            const b = src[si + 2]
            const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
            const tone = options.dark ? 0.3 + 0.7 * Math.min(1, lum * 2.4) : 0.62 + 0.38 * lum
            const coverage = tone * mistFade(yRatio, waveNoise(cx, cy, phase))
            const radius = halftoneRadius(coverage, cellPx)
            if (radius === 0) {
                continue
            }
            const ox = cx * cellPx
            const oy = cy * cellPx
            for (let py = 0; py < cellPx; py++) {
                const dy = py + 0.5 - half
                let di = ((oy + py) * out.width + ox) * 4
                for (let px = 0; px < cellPx; px++, di += 4) {
                    const dx = px + 0.5 - half
                    const alpha = radius - Math.sqrt(dx * dx + dy * dy) + 0.5
                    if (alpha <= 0) {
                        continue
                    }
                    dst[di] = r
                    dst[di + 1] = g
                    dst[di + 2] = b
                    dst[di + 3] = alpha >= 1 ? 255 : Math.round(alpha * 255)
                }
            }
        }
    }
    octx.putImageData(image, 0, 0)
    return out
}

let currentUrl = ''
let renderToken = 0

/**
 * Paints the art for the current window and publishes it as
 * --risu-aurora-art / --risu-aurora-art-size on <html>.
 */
export function applyAuroraArt(dark: boolean): void {
    const token = ++renderToken
    const root = document.documentElement
    const width = Math.min(Math.max(window.innerWidth, 320), 2560)
    const height = Math.round(Math.min(Math.max(window.innerHeight, 480), 1600) * 0.72)
    const canvas = renderAuroraArt({
        width,
        height,
        dark,
        pixelRatio: window.devicePixelRatio || 1,
    })
    canvas.toBlob((blob) => {
        if (!blob || token !== renderToken) {
            return
        }
        const url = URL.createObjectURL(blob)
        root.style.setProperty('--risu-aurora-art', `url("${url}")`)
        root.style.setProperty('--risu-aurora-art-size', `${Math.ceil(width / 4) * 4}px ${Math.ceil(height / 4) * 4}px`)
        if (currentUrl) {
            URL.revokeObjectURL(currentUrl)
        }
        currentUrl = url
    }, 'image/png')
}

/**
 * Starts keeping the art in sync with the window size; returns a stop function.
 * `dark` picks the night sky over the dawn sky to match the color scheme.
 */
export function startAuroraArt(dark: boolean): () => void {
    let lastWidth = 0
    let lastHeight = 0
    let lastRatio = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let ratioQuery: MediaQueryList | undefined
    const update = () => {
        const w = window.innerWidth
        const h = window.innerHeight
        const ratio = window.devicePixelRatio || 1
        if (ratio === lastRatio && Math.abs(w - lastWidth) < 64 && Math.abs(h - lastHeight) < 64) {
            return
        }
        lastWidth = w
        lastHeight = h
        lastRatio = ratio
        applyAuroraArt(dark)
    }
    const onResize = () => {
        clearTimeout(timer)
        timer = setTimeout(update, 250)
    }
    // Moving the window to a screen with another pixel ratio may keep the same
    // CSS size and fire no resize, so watch the current ratio and re-arm on change
    const watchRatio = () => {
        ratioQuery?.removeEventListener('change', onRatioChange)
        ratioQuery = window.matchMedia?.(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
        ratioQuery?.addEventListener('change', onRatioChange)
    }
    const onRatioChange = () => {
        watchRatio()
        onResize()
    }
    update()
    watchRatio()
    window.addEventListener('resize', onResize)
    return () => {
        clearTimeout(timer)
        window.removeEventListener('resize', onResize)
        ratioQuery?.removeEventListener('change', onRatioChange)
        ratioQuery = undefined
        renderToken++
        const root = document.documentElement
        root.style.removeProperty('--risu-aurora-art')
        root.style.removeProperty('--risu-aurora-art-size')
        if (currentUrl) {
            URL.revokeObjectURL(currentUrl)
            currentUrl = ''
        }
    }
}
