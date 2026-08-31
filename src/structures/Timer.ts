import "reflect-metadata"
import { Snowflake } from "discord.js"
import { Column, Entity, ObjectIdColumn, PrimaryColumn } from "typeorm"
import { IPersistedVars, VARS_SCHEMA_VERSION } from "../functions/snapshotVars"

export enum TimerKind {
    timeout = "timeout",
    interval = "interval"
}

export interface ITimerStartOptions {
    /**
     * The name the timer was scheduled under. Unique per kind.
     */
    name: string
    kind: TimerKind

    /**
     * The ForgeScript code to run.
     */
    code: string
    path?: string | null

    /**
     * The name of the command this timer was scheduled from, used to find the live
     * command again on restore.
     */
    commandName?: string | null

    /**
     * Delay for timeouts, tick length for intervals, in ms.
     */
    duration: number

    guildID?: Snowflake | null

    /** 
     * Null when scheduled outside a channel. 
    */
    channelID?: Snowflake | null
    hostID?: Snowflake | null
    messageID?: Snowflake | null

    /**
     * The command arguments present when the timer was scheduled.
     */
    args?: string[]

    vars?: IPersistedVars
}

export interface ITimer extends ITimerStartOptions {
    id: string
    timestamp: number

    /**
     * The variable schema this timer was written under.
     */
    version?: number | null

    /**
     * Absolute unix ms timestamp of the next time this should fire.
     */
    fireAt: number
}

/** Epoch ms overflows an int32 on mysql and postgres, so these columns are bigint */
const numericColumn = {
    to: (value?: number) => value,
    from: (value?: string | number | null) =>
        value === null || value === undefined ? value : Number(value),
}

@Entity()
export class Timer implements ITimer {
    /** What this build writes */
    public static readonly SCHEMA_VERSION = VARS_SCHEMA_VERSION

    /** Primary keys are `varchar(255)` on mysql, and a longer id is rejected, not truncated */
    public static readonly MAX_ID_LENGTH = 255

    /**
     * The id of this timer, in the form `kind:name`.
     */
    @PrimaryColumn()
    public id: string

    /**
     * The name this timer was scheduled under.
     */
    @Column()
    public name: string

    /**
     * The kind of the timer.
     */
    @Column({ type: "varchar" })
    public kind: TimerKind

    /**
     * The ForgeScript code this timer executes.
     */
    @Column("text")
    public code: string

    /**
     * The path of the command this timer was scheduled from.
     */
    @Column({ type: "text", nullable: true })
    public path?: string | null

    /**
     * The name of the command this timer was scheduled from.
     */
    @Column({ type: "text", nullable: true })
    public commandName?: string | null

    /** Variable schema this row was written under. Null predates it and means v0 */
    @Column({ type: "int", nullable: true })
    public version?: number | null

    /**
     * The delay of this timeout, or the tick length of this interval, in ms.
     */
    @Column({ type: "bigint", transformer: numericColumn })
    public duration: number

    /**
     * The timestamp this timer has been created at.
     */
    @Column({ type: "bigint", transformer: numericColumn })
    public timestamp: number

    /**
     * The timestamp this timer is next due to fire at.
     */
    @Column({ type: "bigint", transformer: numericColumn })
    public fireAt: number

    /**
     * The id of the guild this timer has been created on.
     */
    @Column({ type: "varchar", nullable: true })
    public guildID?: Snowflake | null

    /**
     * The id of the channel this timer has been created in, if any.
     */
    @Column({ type: "varchar", nullable: true })
    public channelID?: Snowflake | null

    /**
     * The id of the user that scheduled this timer.
     */
    @Column({ type: "varchar", nullable: true })
    public hostID?: Snowflake | null

    /**
     * The id of the message this timer was scheduled from.
     */
    @Column({ type: "varchar", nullable: true })
    public messageID?: Snowflake | null

    /**
     * The command arguments this timer was scheduled with.
     */
    @Column("simple-json", { nullable: true })
    public args?: string[]

    /**
     * The serializable variables present when this timer was scheduled.
     */
    @Column("simple-json", { nullable: true })
    public vars?: IPersistedVars

    constructor(options?: Partial<ITimerStartOptions>) {
        this.name = options?.name ?? ""
        this.kind = options?.kind ?? TimerKind.timeout
        this.id = Timer.idOf(this.kind, this.name)
        this.code = options?.code ?? ""
        this.path = options?.path ?? null
        this.commandName = options?.commandName ?? null
        this.version = Timer.SCHEMA_VERSION
        this.duration = options?.duration ?? 0
        this.guildID = options?.guildID ?? null
        this.channelID = options?.channelID ?? null
        this.hostID = options?.hostID ?? null
        this.messageID = options?.messageID ?? null
        this.args = options?.args
        this.vars = options?.vars
        this.timestamp = Date.now()
        this.fireAt = this.timestamp + this.duration
    }

    /**
     * Builds the primary key for a timer.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    public static idOf(kind: TimerKind, name: string) {
        return `${kind}:${name}`
    }

    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind The kind of the timer.
     * @returns
     */
    public static maxNameLength(kind: TimerKind) {
        return Timer.MAX_ID_LENGTH - Timer.idOf(kind, "").length
    }

    /**
     * Returns the time left before this timer is due.
     * @returns
     */
    public timeLeft() {
        return Math.max(this.fireAt - Date.now(), 0)
    }

    /**
     * Returns how long past due this timer is, or 0 if it isn't yet.
     * @returns
     */
    public overdueBy() {
        return Math.max(Date.now() - this.fireAt, 0)
    }

    /**
     * Returns whether this timer was due while the app was down.
     * @returns
     */
    public isOverdue() {
        return this.fireAt <= Date.now()
    }

    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     * @returns
     */
    public missedTicks() {
        if (this.kind !== TimerKind.interval || this.duration <= 0) return 0
        return Math.floor(this.overdueBy() / this.duration) + 1
    }

    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     * @returns
     */
    public scheduleNext() {
        this.fireAt = Date.now() + this.duration
        return this
    }

    /**
     * Steps whole ticks into the future, keeping the phase — a slow run shifts by ticks, not by itself.
     * @returns
     */
    public advance() {
        if (this.duration <= 0) return this.scheduleNext()

        const ticks = Math.max(1, Math.floor((Date.now() - this.fireAt) / this.duration) + 1)
        this.fireAt += ticks * this.duration
        return this
    }

    /**
     * Clones this timer.
     * @returns
     */
    public clone() {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this) as this
    }
}

@Entity()
export class MongoTimer extends Timer {
    /**
     * The object id for MongoDB.
     */
    @ObjectIdColumn()
    public mongoId?: string
}