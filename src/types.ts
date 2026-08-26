export interface IBaseTimerConfig {
    /**
     * Whether persisted timers of this kind are re-armed on startup.
     * With `false` they're dropped instead. Defaults to `true`.
     */
    persist?: boolean

    /**
     * How late (in ms) a timer may be when the app comes back up.
     * Omitted / 0 means no limit.
     */
    maxOverdue?: number
}

export interface ITimeoutConfig extends IBaseTimerConfig {
    /**
     * A timeout overdue by more than `maxOverdue` is discarded instead of fired.
     */
    maxOverdue?: number
}

export interface IIntervalConfig extends IBaseTimerConfig {
    /**
     * How many ticks missed during downtime to replay on startup.
     *
     * - `0` (default) — replay nothing, just resume the schedule.
     * - `-1` — no limit: replay every tick that elapsed while offline. USE WITH CAUTION!
     * - `n > 0` — replay at most n of the missed ticks.
     */
    restoredTicksLimit?: number

    /**
     * An interval whose next due tick is overdue by more than `maxOverdue` skips that stale tick and resumes its schedule from now.
     */
    maxOverdue?: number
}