import "reflect-metadata"
import { Snowflake } from "discord.js"
import { Column, Entity, ObjectIdColumn, PrimaryColumn } from "typeorm"
import { IPersistedVars } from "../functions/snapshotVars"

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
     * Delay for timeouts, tick length for intervals, in ms.
     */
    duration: number

    guildID?: Snowflake | null
    channelID: Snowflake
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
     * Absolute unix ms timestamp of the next time this should fire.
     */
    fireAt: number
}

/**
 * Epoch milliseconds overflow a 32-bit int on mysql and postgres, so these columns are bigint.
 */
const numericColumn = {
    to: (value?: number) => value,
    from: (value?: string | number | null) =>
        value === null || value === undefined ? value : Number(value),
}

@Entity()
export class Timer implements ITimer {
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
     * The id of the channel this timer has been created in.
     */
    @Column()
    public channelID: Snowflake

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
        this.duration = options?.duration ?? 0
        this.guildID = options?.guildID ?? null
        this.channelID = options?.channelID ?? ""
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
     * Returns how many ticks elapsed since this timer was last due.
     * Always 0 for timeouts, which only ever fire once.
     * @returns
     */
    public missedTicks() {
        if (this.kind !== TimerKind.interval || this.duration <= 0) return 0
        return Math.floor(this.overdueBy() / this.duration) + 1
    }

    /**
     * Moves this timer's due time to the next tick.
     * @returns
     */
    public scheduleNext() {
        this.fireAt = Date.now() + this.duration
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