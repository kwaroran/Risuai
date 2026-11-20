import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaveLoopWatch, SAVE_LOOP_STALL_MS, type SaveLoopNotice } from './saveLoopWatch'

describe('save loop watch', () => {
    let visible: boolean
    let alertOpen: boolean
    let notices: SaveLoopNotice[]
    let watch: ReturnType<typeof createSaveLoopWatch>

    beforeEach(() => {
        vi.useFakeTimers()
        vi.spyOn(console, 'error').mockImplementation(() => {})
        visible = true
        alertOpen = false
        notices = []
        watch = createSaveLoopWatch({
            isVisible: () => visible,
            isAlertOpen: () => alertOpen,
            notify: (notice) => notices.push(notice),
        })
        watch.start()
    })

    afterEach(() => {
        watch.stop()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('tells once when one step takes too long', () => {
        watch.step('write')
        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS - 5000)
        expect(notices).toEqual([])

        vi.advanceTimersByTime(5000)
        expect(notices).toEqual([{ kind: 'stuck', step: 'write', lastSaved: 0 }])

        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS * 2)
        expect(notices).toHaveLength(1)
    })

    it('does not tell while the loop keeps moving', () => {
        for (let i = 0; i < 60; i++) {
            watch.step('idle')
            vi.advanceTimersByTime(5000)
        }
        expect(notices).toEqual([])
    })

    it('tells again about a later stall after the loop moved on', () => {
        watch.step('write')
        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS)
        watch.saved()
        const savedAt = Date.now()
        watch.step('idle')
        watch.step('write')
        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS)
        expect(notices).toHaveLength(2)
        expect(notices[1]).toEqual({ kind: 'stuck', step: 'write', lastSaved: savedAt })
    })

    it('does not count time while the page is hidden or an alert is open', () => {
        watch.step('write')
        visible = false
        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS * 2)
        visible = true
        alertOpen = true
        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS * 2)
        alertOpen = false
        expect(notices).toEqual([])

        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS)
        expect(notices).toHaveLength(1)
    })

    it('does not count a long timer pause, such as device sleep', () => {
        watch.step('write')
        vi.advanceTimersByTime(5000)
        //the clock jumps but the interval fires only once
        vi.setSystemTime(Date.now() + SAVE_LOOP_STALL_MS * 2)
        vi.advanceTimersByTime(5000)
        expect(notices).toEqual([])
    })

    it('waits for an open alert to close before telling', () => {
        watch.step('write')
        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS - 5000)
        watch.died(new Error('boom'))
        alertOpen = true
        vi.advanceTimersByTime(60000)
        expect(notices).toEqual([])

        alertOpen = false
        vi.advanceTimersByTime(5000)
        expect(notices).toHaveLength(1)
        expect(notices[0].kind).toBe('stopped')
    })

    it('tells right away when the loop stops, and only once', () => {
        const error = new Error('boom')
        watch.died(error)
        watch.died(new Error('again'))
        vi.advanceTimersByTime(5000)
        expect(notices).toEqual([{ kind: 'stopped', error, lastSaved: 0 }])

        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS * 2)
        expect(notices).toHaveLength(1)
    })

    it('stops checking after stop', () => {
        watch.step('write')
        watch.stop()
        vi.advanceTimersByTime(SAVE_LOOP_STALL_MS * 2)
        expect(notices).toEqual([])
    })
})
