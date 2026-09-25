import { Snowflake } from "discord.js"
import { IPersistedVars, VARS_SCHEMA_VERSION } from "./PersistedVars"
import { missedRuns, nextRun } from "../functions/cron"
import { IStoredOverrides } from "../types"

export enum TimerKind {
    timeout = "timeout",
    interval = "interval",
    cron = "cron",
}

/**
 * The kinds that run off a gap rather than off an expression.
 */
export type GapKind = TimerKind.timeout | TimerKind.interval

/**
 * What a timer is scheduled with whatever its kind. A kind adds its own schedule on top.
 */
export interface IBaseTimerOptions {
    /**
     * The name the timer was scheduled under. Unique per kind.
     */
    name: string

    /**
     * The ForgeScript code to run.
     */
    code?: string
    path?: string | null

    /**
     * Name of the command it was scheduled from.
     */
    commandName?: string | null

    guildID?: Snowflake | null
    channelID?: Snowflake | null
    authorID?: Snowflake | null
    messageID?: Snowflake | null

    /**
     * The command arguments present when the timer was scheduled.
     */
    args?: string[]

    /**
     * Options the call spelled out.
     */
    config?: IStoredOverrides | null

    vars?: IPersistedVars
}

/**
 * A timer that runs once, a delay from now.
 */
export interface ITimeoutStartOptions extends IBaseTimerOptions {
    kind: TimerKind.timeout

    /**
     * How long from now it runs, in ms.
     */
    duration: number
}

/**
 * A timer that runs every `duration` until it is cleared.
 */
export interface IIntervalStartOptions extends IBaseTimerOptions {
    kind: TimerKind.interval

    /**
     * The gap between ticks, in ms.
     */
    duration: number
}

/**
 * A timer that keeps to an expression, has no duration of its own.
 */
export interface ICronStartOptions extends IBaseTimerOptions {
    kind: TimerKind.cron

    /**
     * The cron expression it runs on.
     */
    cron: string

    /**
     * Zone the expression is read in, null for the process zone.
     */
    timezone?: string | null
}

/**
 * Whichever schedule a kind takes.
 */
export type ITimerStartOptions = ITimeoutStartOptions | IIntervalStartOptions | ICronStartOptions

/**
 * A stored row.
 */
export interface ITimer extends IBaseTimerOptions {
    id: string
    kind: TimerKind
    code: string
    timestamp: number

    /**
     * The variable schema this timer was written under.
     */
    version?: number | null

    /**
     * Delay for timeouts, tick length for intervals, in ms. Always 0 for a cron.
     */
    duration: number

    /**
     * The cron expression a cron timer runs on.
     */
    cron?: string | null

    /**
     * Zone the expression is read in, null for the process zone.
     */
    timezone?: string | null

    /**
     * Absolute unix ms timestamp of the next time this should fire.
     */
    fireAt: number

    /**
     * When it was paused, or null while it is running.
     */
    pausedAt?: number | null
}

export class Timer implements ITimer {
    /**
     * Variable schema this build writes.
     */
    public static readonly SCHEMA_VERSION = VARS_SCHEMA_VERSION

    /**
     * Primary keys are `varchar(255)` on mysql, and a longer id is rejected.
     */
    public static readonly MAX_ID_LENGTH = 255

    /**
     * Primary key, `kind:name`.
     */
    public id: string

    /**
     * Name it was scheduled under.
     */
    public name: string

    /**
     * Timeout, interval or cron.
     */
    public kind: TimerKind

    /**
     * ForgeScript code it runs.
     */
    public code: string

    /**
     * Path of the command it was scheduled from.
     */
    public path?: string | null

    /**
     * Name of the command it was scheduled from.
     */
    public commandName?: string | null

    /**
     * Variable schema this row was written under.
     * Null predates it and means v0.
     */
    public version?: number | null

    /**
     * Delay of a timeout or tick length of an interval, in ms. Always 0 for a cron.
     */
    public duration: number

    /**
     * Cron expression, when it is a cron.
     */
    public cron?: string | null

    /**
     * Zone the expression is read in, null for the process zone.
     */
    public timezone?: string | null

    /**
     * When it was scheduled, unix ms.
     */
    public timestamp: number

    /**
     * When it is next due, unix ms.
     */
    public fireAt: number

    /**
     * When it was paused, null while running.
     */
    public pausedAt?: number | null

    /**
     * Guild it was scheduled in.
     */
    public guildID?: Snowflake | null

    /**
     * Channel it was scheduled in, if any.
     */
    public channelID?: Snowflake | null

    /**
     * User who scheduled it.
     */
    public authorID?: Snowflake | null

    /**
     * Message it was scheduled from.
     */
    public messageID?: Snowflake | null

    /**
     * Command arguments at scheduling time.
     */
    public args?: string[]

    /**
     * Options the call spelled out.
     */
    public config?: IStoredOverrides | null

    /**
     * Variables at scheduling time, the serializable ones.
     */
    public vars?: IPersistedVars

    constructor(options?: ITimerStartOptions) {
        this.name = options?.name ?? ""
        this.kind = options?.kind ?? TimerKind.timeout
        this.id = Timer.idOf(this.kind, this.name)
        this.code = options?.code ?? ""
        this.path = options?.path ?? null
        this.commandName = options?.commandName ?? null
        this.version = Timer.SCHEMA_VERSION
        this.guildID = options?.guildID ?? null
        this.channelID = options?.channelID ?? null
        this.authorID = options?.authorID ?? null
        this.messageID = options?.messageID ?? null
        this.args = options?.args
        this.config = options?.config ?? null
        this.vars = options?.vars
        this.timestamp = Date.now()
        this.pausedAt = null

        // a cron owns no gap
        if (options?.kind === TimerKind.cron) {
            this.cron = options.cron
            this.timezone = options.timezone ?? null
            this.duration = 0
            this.fireAt = nextRun(this.cron, this.timestamp, this.timezone)
        } else {
            this.cron = null
            this.timezone = null
            this.duration = options?.duration ?? 0
            this.fireAt = this.timestamp + this.duration
        }
    }

    /**
     * A timer with nothing but its identity, for reporting one that is already gone.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    public static stub(kind: TimerKind, name: string) {
        const now = Date.now()

        return Timer.from({
            id: Timer.idOf(kind, name),
            name,
            kind,
            code: "",
            duration: 0,
            version: Timer.SCHEMA_VERSION,
            timestamp: now,
            fireAt: now,
            pausedAt: null,
        })
    }

    /**
     * Whether it keeps to an expression rather than a gap.
     */
    public isCron(): this is Timer & { cron: string } {
        return this.kind === TimerKind.cron && typeof this.cron === "string" && this.cron.length > 0
    }

    /**
     * Whether it is on hold, neither running nor falling behind.
     */
    public isPaused() {
        return typeof this.pausedAt === "number"
    }

    /**
     * Rebuilds a timer from a stored row, for a backend that hands back plain data. Folds a pre-2.0.0 `hostID` into `authorID`.
     * @param data Row to rebuild.
     */
    public static from(data: ITimer) {
        const timer = Object.assign(Object.create(Timer.prototype), data) as Timer & { hostID?: Snowflake | null }

        if (timer.authorID === undefined) timer.authorID = timer.hostID ?? null
        delete timer.hostID

        return timer as Timer
    }

    /**
     * Builds the primary key for a timer.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    public static idOf(kind: TimerKind, name: string) {
        return `${kind}:${name}`
    }

    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind Timer kind.
     */
    public static maxNameLength(kind: TimerKind) {
        return Timer.MAX_ID_LENGTH - Timer.idOf(kind, "").length
    }

    /**
     * Time left before it is due.
     */
    public timeLeft() {
        // a paused timer stopped counting down the moment it was paused
        return Math.max(this.fireAt - (this.pausedAt ?? Date.now()), 0)
    }

    /**
     * How long past due it is, 0 when not yet.
     */
    public overdueBy() {
        if (this.isPaused()) return 0
        return Math.max(Date.now() - this.fireAt, 0)
    }

    /**
     * Whether it came due while the app was down.
     */
    public isOverdue() {
        if (this.isPaused()) return false
        return this.fireAt <= Date.now()
    }

    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     * @param limit Most worth counting. A cron counts them one by one.
     */
    public missedTicks(limit = Infinity) {
        if (this.isPaused()) return 0

        // an expression has no gap to divide by, only up to the limit
        if (this.isCron()) return missedRuns(this.cron, this.fireAt, limit, this.timezone)

        if (this.kind !== TimerKind.interval || this.duration <= 0) return 0
        return Math.floor(this.overdueBy() / this.duration) + 1
    }

    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     */
    public scheduleNext() {
        this.fireAt = this.isCron() ? nextRun(this.cron, Date.now(), this.timezone) : Date.now() + this.duration
        return this
    }

    /**
     * Steps whole ticks into the future, keeping the phase. A slow run shifts by ticks, not by itself.
     */
    public advance() {
        // measured from the occurrence just run, a slow one shifts by whole occurrences
        if (this.isCron()) {
            this.fireAt = nextRun(this.cron, Math.max(this.fireAt, Date.now()), this.timezone)
            return this
        }

        if (this.duration <= 0) return this.scheduleNext()

        const ticks = Math.max(1, Math.floor((Date.now() - this.fireAt) / this.duration) + 1)
        this.fireAt += ticks * this.duration
        return this
    }
}

export class MongoTimer extends Timer {
    /**
     * The object id for MongoDB.
     */
    public mongoId?: string

    /**
     * What builds before 2.0.0 wrote the author under, read beside {@link Timer.authorID} on mongo alone.
     */
    public hostID?: Snowflake | null
}
