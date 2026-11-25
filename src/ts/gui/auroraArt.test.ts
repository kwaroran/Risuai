import { describe, expect, it } from 'vitest'
import { createRng, halftoneRadius, mistFade } from './auroraArt'

describe('createRng', () => {
    it('repeats the same sequence for the same seed', () => {
        const a = createRng(42)
        const b = createRng(42)
        const first = Array.from({ length: 8 }, a)
        expect(Array.from({ length: 8 }, b)).toEqual(first)
        expect(Array.from({ length: 8 }, createRng(43))).not.toEqual(first)
    })

    it('stays within [0, 1)', () => {
        const rng = createRng(7)
        for (let i = 0; i < 1000; i++) {
            const value = rng()
            expect(value).toBeGreaterThanOrEqual(0)
            expect(value).toBeLessThan(1)
        }
    })
})

describe('halftoneRadius', () => {
    it('drops dots too faint to see', () => {
        expect(halftoneRadius(0, 6)).toBe(0)
        expect(halftoneRadius(0.02, 6)).toBe(0)
        expect(halftoneRadius(-1, 6)).toBe(0)
    })

    it('grows with coverage and keeps dots inside their cell', () => {
        let last = 0
        for (let c = 0.05; c <= 1; c += 0.05) {
            const r = halftoneRadius(c, 6)
            expect(r).toBeGreaterThan(last)
            expect(r).toBeLessThan(6)
            last = r
        }
        expect(halftoneRadius(3, 6)).toBe(halftoneRadius(1, 6))
    })
})

describe('mistFade', () => {
    it('is solid at the top and gone at the bottom', () => {
        expect(mistFade(0)).toBe(1)
        expect(mistFade(0.1)).toBe(1)
        expect(mistFade(1)).toBe(0)
    })

    it('fades monotonically in between', () => {
        let last = 1
        for (let y = 0.25; y < 0.9; y += 0.05) {
            const value = mistFade(y)
            expect(value).toBeLessThan(last)
            last = value
        }
    })
})
