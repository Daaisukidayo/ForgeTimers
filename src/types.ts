import type { Timer } from "./structures/Timer"
import type { TimerStorage } from "./structures/Database"

export interface IForgeTimersOptions {
    timeoutConfig?: ITimeoutConfig
    intervalConfig?: IIntervalConfig
    cronConfig?: ICronConfig

    /**
     * Deletes timers of guilds this process can't see on startup. Off by default.
     * Usually that's an outage or a sibling shard, only safe unsharded.
     */
    pruneUnknownGuilds?: boolean

    /**
     * Which extension keeps the timers, `"forgedb"` by default or `"quorieldb"`.
     */
    storage?: TimerStorage

    /**
     * Moves stored timers from this backend into {@link storage} on startup, once.
     * Both extensions have to be loaded for that boot. Names taken in the target stay where they are.
     */
    migrateFrom?: TimerStorage

    /**
     * Copies on migration instead of moving.
     * The source keeps its timers and the migration reruns every boot until `migrateFrom` goes.
     */
    keepSource?: boolean

    /**
     * Which timer events to listen to.
     */
    events?: TimerEventName[]
}

export interface IBaseTimerConfig {
    /**
     * Whether persisted timers of this kind are re-armed on startup.
     * With `false` they're dropped instead. Defaults to `true`.
     */
    persist?: boolean

    /**
     * How late in ms a timer may be when the app comes back. Omitted or 0 is no limit.
     * Past it a timeout is discarded.
     * An interval skips the stale tick and carries on from now, a cron from its next occurrence.
     */
    maxOverdue?: number
}

export type ITimeoutConfig = IBaseTimerConfig

/** A cron replays what it slept through the same way an interval does */
export type ICronConfig = IIntervalConfig

export interface IIntervalConfig extends IBaseTimerConfig {
    /** Missed ticks to run on startup. At most `n`, all at `Infinity`, none at `0` (default) or below. */
    restoredTicksLimit?: number
}

/**
 * The same options a kind's config carries.
 */
export type ITimerOverrides = IIntervalConfig

export type IStoredOverrides = Omit<ITimerOverrides, "restoredTicksLimit"> & {
    restoredTicksLimit?: number | "Infinity"
}

export enum TimerEvent {
    /** A timer was scheduled */
    timerStart = "timerStart",

    /** A timer's code ran. A timeout going off, an interval ticking or a cron coming round */
    timerFire = "timerFire",

    /** A timer was cancelled by hand */
    timerCancel = "timerCancel",

    /** A timer was put on hold, keeping its record and what was left of its wait */
    timerPause = "timerPause",

    /** A timer on hold was started again, from where its wait was left */
    timerResume = "timerResume",

    /** A stored timer was picked back up after a restart, with `$eventData[overdueBy]` saying how late */
    timerRestore = "timerRestore",

    /** A stored timer was thrown away without running, with `$eventData[dropReason]` saying why */
    timerDrop = "timerDrop",

    /**
     * Startup finished dealing with every stored timer, counted by `$eventData[restored]` and `$eventData[dropped]`.
     * Does not fire at all if the storage could not be opened.
     */
    timersReady = "timersReady",

    /** The timer storage opened, and timers will be kept across restarts */
    databaseConnect = "databaseConnect",

    /** The storage could not be opened, with `$eventData[failReason]` saying why. Nothing is persisted */
    databaseFail = "databaseFail",
}

export type TimerEventName = `${TimerEvent}`

/**
 * What an event hands its listener.
 */
export interface ITimerEventPayload {
    /**
     * The timer it is about, read with `$timerData`. Absent when the event is about the boot.
     */
    timer?: Timer

    /**
     * The timer as it was before this event changed it, read with `$oldTimer`.
     */
    previous?: Timer

    /**
     * What the event adds on top of that timer.
     */
    event?: ITimerEventData
}

export type ITimerEvents = Record<TimerEventName, [payload: ITimerEventPayload]>

/**
 * What an event carries besides its timer.
 */
export interface ITimerEventData {
    /** Why a timer was thrown away without running. */
    dropReason?: string

    /** Why the storage could not be opened. */
    failReason?: string

    /** How late a timer was when startup reached it, in ms. */
    overdueBy?: number

    /** How many stored timers startup picked back up. */
    restored?: number

    /** How many it threw away instead. */
    dropped?: number
}
