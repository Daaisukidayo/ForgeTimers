export interface IBaseTimerConfig {
    /**
     * Whether persisted timers of this kind are re-armed on startup.
     * With `false` they're dropped instead. Defaults to `true`.
     */
    persist?: boolean;
    /**
     * How late (in ms) a timer may be when the app comes back up.
     * Omitted / 0 means no limit.
     */
    maxOverdue?: number;
}
export interface ITimeoutConfig extends IBaseTimerConfig {
    /**
     * A timeout overdue by more than `maxOverdue` is discarded instead of fired.
     */
    maxOverdue?: number;
}
export interface IIntervalConfig extends IBaseTimerConfig {
    /**
     * Missed ticks to replay on startup: `0` none (default), `-1` all - careful — or at most `n`.
     */
    restoredTicksLimit?: number;
    /**
     * An interval whose next due tick is overdue by more than `maxOverdue` skips that stale tick and resumes its schedule from now.
     */
    maxOverdue?: number;
}
//# sourceMappingURL=types.d.ts.map