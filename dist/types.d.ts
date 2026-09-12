/** Which extension holds the timers */
export type TimerStorage = "forgedb" | "quorieldb";
export interface IForgeTimersOptions {
    timeoutConfig?: ITimeoutConfig;
    intervalConfig?: IIntervalConfig;
    /**
     * Delete timers whose guild this process can't see on startup. Off by default.
     * That's usually an outage or a sibling shard. Only safe unsharded.
     */
    pruneUnknownGuilds?: boolean;
    /**
     * Which extension keeps the timers: `"forgedb"` (default) or `"quorieldb"`.
     */
    storage?: TimerStorage;
    /**
     * Move stored timers out of this database and into {@link storage} on startup, once.
     * Both extensions have to be loaded for that boot. Names already taken in the target
     * are left alone.
     */
    migrateFrom?: TimerStorage;
    /**
     * Copy on migration instead of moving. The source keeps its timers, which means the
     * migration runs again on every boot until `migrateFrom` is removed.
     */
    keepSource?: boolean;
    /**
     * Which timer events to listen to.
     */
    events?: TimerEvent[];
}
export interface IBaseTimerConfig {
    /**
     * Whether persisted timers of this kind are re-armed on startup.
     * With `false` they're dropped instead. Defaults to `true`.
     */
    persist?: boolean;
    /**
     * How late (in ms) a timer may be when the app comes back up.
     * Omitted / 0 means no limit. A timeout past it is discarded instead of fired,
     * while an interval skips the stale tick and resumes its schedule from now.
     */
    maxOverdue?: number;
}
export type ITimeoutConfig = IBaseTimerConfig;
export interface IIntervalConfig extends IBaseTimerConfig {
    /**
     * Missed ticks to replay on startup: `0` none (default), `-1` all - careful — or at most `n`.
     */
    restoredTicksLimit?: number;
}
export declare enum TimerEvent {
    /** A timer was scheduled */
    timerStart = "timerStart",
    /** A timer's code ran: a timeout going off, or an interval ticking */
    timerFire = "timerFire",
    /** A timer was cancelled by hand */
    timerCancel = "timerCancel",
    /** A stored timer was picked back up after a restart */
    timerRestore = "timerRestore",
    /** A stored timer was thrown away without running, with `$env[reason]` saying why */
    timerDrop = "timerDrop"
}
/** Every timer event hands its command the timer's properties, so they all take the same argument */
export type ITimerEvents = Record<TimerEvent, [environment: Record<string, unknown>]>;
//# sourceMappingURL=types.d.ts.map