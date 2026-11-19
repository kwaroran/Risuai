const TICK_MS = 5000
/** How long the save loop may stay in one step before the user is told. */
export const SAVE_LOOP_STALL_MS = 120000

export type SaveLoopNotice =
    | { kind: 'stuck', step: string, lastSaved: number }
    | { kind: 'stopped', error: unknown, lastSaved: number }

export interface SaveLoopWatchOptions {
    /** Whether the page is visible. Hidden tabs throttle timers, so their time is not counted. */
    isVisible: () => boolean
    /**
     * Whether an alert is open. Its time is not counted, because a save step can be
     * waiting for the user there, such as a login prompt, and a notice would replace it.
     */
    isAlertOpen: () => boolean
    /** Shows the notice. Called only while no alert is open. */
    notify: (notice: SaveLoopNotice) => void
}

/**
 * Tells the user when the save loop stops making progress.
 *
 * The loop reports each step it starts. If it stays in one step for
 * SAVE_LOOP_STALL_MS, usually because a storage write never settles, or if the loop
 * ends, which it never should, a notice is shown once. It only reports: a hung write
 * cannot be cancelled safely, since it could still land after a newer one.
 */
export function createSaveLoopWatch(options: SaveLoopWatchOptions) {
    let timer: ReturnType<typeof setInterval> | null = null
    let lastTick = 0
    let step = 'start'
    /** Time counted in the current step, leaving out hidden tabs, open alerts and sleep. */
    let stalledFor = 0
    let lastSaved = 0
    let stuckNotified = false
    let stopped: { error: unknown } | null = null
    let pending: SaveLoopNotice | null = null

    function tick() {
        const now = Date.now()
        const gap = now - lastTick
        lastTick = now
        if (!options.isVisible() || options.isAlertOpen()) {
            return
        }
        //a much longer gap means the timer was paused, e.g. while the device slept
        if (gap <= TICK_MS * 3 && !stopped) {
            stalledFor += gap
        }
        if (!stuckNotified && !stopped && stalledFor >= SAVE_LOOP_STALL_MS) {
            stuckNotified = true
            console.error(`[SaveLoopWatch] save loop has been in "${step}" for ${Math.round(stalledFor / 1000)}s`)
            pending = { kind: 'stuck', step, lastSaved }
        }
        if (pending) {
            const notice = pending
            pending = null
            options.notify(notice)
        }
    }

    function start() {
        if (timer) {
            return
        }
        lastTick = Date.now()
        timer = setInterval(() => {
            try {
                tick()
            } catch (error) {
                console.error('[SaveLoopWatch] check failed', error)
            }
        }, TICK_MS)
    }

    function stop() {
        if (timer) {
            clearInterval(timer)
            timer = null
        }
    }

    return {
        start,
        stop,
        /** Called by the save loop on every iteration and before each step that awaits. */
        step(name: string) {
            step = name
            stalledFor = 0
            stuckNotified = false
        },
        /** Called by the save loop after a save was written. */
        saved() {
            lastSaved = Date.now()
        },
        /** Called when the save loop ended. */
        died(error: unknown) {
            if (stopped) {
                return
            }
            console.error('[SaveLoopWatch] save loop stopped', error)
            stopped = { error }
            pending = { kind: 'stopped', error, lastSaved }
        },
    }
}

export type SaveLoopWatch = ReturnType<typeof createSaveLoopWatch>
