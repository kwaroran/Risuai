import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequestPacer } from './requestPacer'

describe('createRequestPacer', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(0)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('lets requests through until the limit, then waits for the window to move', async () => {
        const pace = createRequestPacer(3, 1000)
        for(let i = 0; i < 3; i++){
            await pace()
        }

        let done = false
        const fourth = pace().then(() => { done = true })
        await vi.advanceTimersByTimeAsync(999)
        expect(done).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await fourth
        expect(Date.now()).toBe(1000)
    })

    it('never lets more than the limit through in any window', async () => {
        const pace = createRequestPacer(5, 1000)
        const times: number[] = []
        const waiters = Array.from({ length: 23 }, () => pace().then(() => { times.push(Date.now()) }))
        await vi.advanceTimersByTimeAsync(10000)
        await Promise.all(waiters)

        expect(times).toHaveLength(23)
        for(const start of times){
            expect(times.filter((time) => time >= start && time < start + 1000).length).toBeLessThanOrEqual(5)
        }
    })
})
