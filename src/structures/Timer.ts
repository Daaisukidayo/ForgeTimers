import { Snowflake } from "discord.js"
import { IPersistedVars, VARS_SCHEMA_VERSION } from "../functions/snapshotVars"
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
     * The name of the command this timer was scheduled from.
     */
    commandName?: string | null

    guildID?: Snowflake | null
    channelID?: Snowflake | null
    hostID?: Snowflake | null
    messageID?: Snowflake | null

    /**
     * The command arguments present when the timer was scheduled.
     */
    args?: string[]

    /**
     * The options this timer was scheduled with.
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
     * The zone that expression is read in, or null for whatever the process runs in.
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
     * The zone that expression is read in, or null for whatever the process runs in.
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
     * What this build writes.
     */
    public static readonly SCHEMA_VERSION = VARS_SCHEMA_VERSION

    /**
     * Primary keys are `varchar(255)` on mysql, and a longer id is rejected.
     */
    public static readonly MAX_ID_LENGTH = 255

    /**
     * The id of this timer, in the form `kind:name`.
     */
    public id: string

    /**
     * The name this timer was scheduled under.
     */
    public name: string

    /**
     * The kind of the timer.
     */
    public kind: TimerKind

    /**
     * The ForgeScript code this timer executes.
     */
    public code: string

    /**
     * The path of the command this timer was scheduled from.
     */
    public path?: string | null

    /**
     * The name of the command this timer was scheduled from.
     */
    public commandName?: string | null

    /**
     * Variable schema this row was written under.
     * Null predates it and means v0.
     */
    public version?: number | null

    /**
     * The delay of this timeout, or the tick length of this interval, in ms. Always 0 for a cron.
     */
    public duration: number

    /**
     * The cron expression this timer runs on, when it is one.
     */
    public cron?: string | null

    /**
     * The zone that expression is read in, or null for whatever the process runs in.
     */
    public timezone?: string | null

    /**
     * The timestamp this timer has been created at.
     */
    public timestamp: number

    /**
     * The timestamp this timer is next due to fire at.
     */
    public fireAt: number

    /**
     * The timestamp this timer was paused at, or null while it is running.
     */
    public pausedAt?: number | null

    /**
     * The id of the guild this timer has been created on.
     */
    public guildID?: Snowflake | null

    /**
     * The id of the channel this timer has been created in, if any.
     */
    public channelID?: Snowflake | null

    /**
     * The id of the user that scheduled this timer.
     */
    public hostID?: Snowflake | null

    /**
     * The id of the message this timer was scheduled from.
     */
    public messageID?: Snowflake | null

    /**
     * The command arguments this timer was scheduled with.
     */
    public args?: string[]

    /**
     * The options this timer was scheduled with.
     */
    public config?: IStoredOverrides | null

    /**
     * The serializable variables present when this timer was scheduled.
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
        this.hostID = options?.hostID ?? null
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
     * @param kind The kind of the timer.
     * @param name The name of the timer.
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
     * Whether this timer keeps to an expression rather than to a gap.
     */
    public isCron(): this is Timer & { cron: string } {
        return this.kind === TimerKind.cron && typeof this.cron === "string" && this.cron.length > 0
    }

    /**
     * Whether this timer is on hold, and so neither running nor falling behind.
     */
    public isPaused() {
        return typeof this.pausedAt === "number"
    }

    /**
     * Rebuilds a timer from a stored row, for a backend that hands back plain data.
     * @param data The row to rebuild from.
     */
    public static from(data: ITimer) {
        return Object.assign(Object.create(Timer.prototype), data) as Timer
    }

    /**
     * Builds the primary key for a timer.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    public static idOf(kind: TimerKind, name: string) {
        return `${kind}:${name}`
    }

    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind The kind of the timer.
     */
    public static maxNameLength(kind: TimerKind) {
        return Timer.MAX_ID_LENGTH - Timer.idOf(kind, "").length
    }

    /**
     * Returns the time left before this timer is due.
     */
    public timeLeft() {
        // a paused timer stopped counting down the moment it was paused
        return Math.max(this.fireAt - (this.pausedAt ?? Date.now()), 0)
    }

    /**
     * Returns how long past due this timer is, or 0 if it isn't yet.
     */
    public overdueBy() {
        if (this.isPaused()) return 0
        return Math.max(Date.now() - this.fireAt, 0)
    }

    /**
     * Returns whether this timer was due while the app was down.
     */
    public isOverdue() {
        if (this.isPaused()) return false
        return this.fireAt <= Date.now()
    }

    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
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
     * Steps whole ticks into the future, keeping the phase — a slow run shifts by ticks, not by itself.
     */
    public advance() {
        // measured from the occurrence just run, so a slow one shifts by occurrences rather than by itself
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
}
