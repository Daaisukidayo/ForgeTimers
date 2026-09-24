import { Snowflake } from "discord.js";
import { IPersistedVars } from "./PersistedVars";
import { IStoredOverrides } from "../types";
export declare enum TimerKind {
    timeout = "timeout",
    interval = "interval",
    cron = "cron"
}
/**
 * The kinds that run off a gap rather than off an expression.
 */
export type GapKind = TimerKind.timeout | TimerKind.interval;
/**
 * What a timer is scheduled with whatever its kind. A kind adds its own schedule on top.
 */
export interface IBaseTimerOptions {
    /**
     * The name the timer was scheduled under. Unique per kind.
     */
    name: string;
    /**
     * The ForgeScript code to run.
     */
    code?: string;
    path?: string | null;
    /**
     * Name of the command it was scheduled from.
     */
    commandName?: string | null;
    guildID?: Snowflake | null;
    channelID?: Snowflake | null;
    authorID?: Snowflake | null;
    messageID?: Snowflake | null;
    /**
     * The command arguments present when the timer was scheduled.
     */
    args?: string[];
    /**
     * Options the call spelled out.
     */
    config?: IStoredOverrides | null;
    vars?: IPersistedVars;
}
/**
 * A timer that runs once, a delay from now.
 */
export interface ITimeoutStartOptions extends IBaseTimerOptions {
    kind: TimerKind.timeout;
    /**
     * How long from now it runs, in ms.
     */
    duration: number;
}
/**
 * A timer that runs every `duration` until it is cleared.
 */
export interface IIntervalStartOptions extends IBaseTimerOptions {
    kind: TimerKind.interval;
    /**
     * The gap between ticks, in ms.
     */
    duration: number;
}
/**
 * A timer that keeps to an expression, has no duration of its own.
 */
export interface ICronStartOptions extends IBaseTimerOptions {
    kind: TimerKind.cron;
    /**
     * The cron expression it runs on.
     */
    cron: string;
    /**
     * Zone the expression is read in, null for the process zone.
     */
    timezone?: string | null;
}
/**
 * Whichever schedule a kind takes.
 */
export type ITimerStartOptions = ITimeoutStartOptions | IIntervalStartOptions | ICronStartOptions;
/**
 * A stored row.
 */
export interface ITimer extends IBaseTimerOptions {
    id: string;
    kind: TimerKind;
    code: string;
    timestamp: number;
    /**
     * The variable schema this timer was written under.
     */
    version?: number | null;
    /**
     * Delay for timeouts, tick length for intervals, in ms. Always 0 for a cron.
     */
    duration: number;
    /**
     * The cron expression a cron timer runs on.
     */
    cron?: string | null;
    /**
     * Zone the expression is read in, null for the process zone.
     */
    timezone?: string | null;
    /**
     * Absolute unix ms timestamp of the next time this should fire.
     */
    fireAt: number;
    /**
     * When it was paused, or null while it is running.
     */
    pausedAt?: number | null;
}
export declare class Timer implements ITimer {
    /**
     * Variable schema this build writes.
     */
    static readonly SCHEMA_VERSION = 1;
    /**
     * Primary keys are `varchar(255)` on mysql, and a longer id is rejected.
     */
    static readonly MAX_ID_LENGTH = 255;
    /**
     * Primary key, `kind:name`.
     */
    id: string;
    /**
     * Name it was scheduled under.
     */
    name: string;
    /**
     * Timeout, interval or cron.
     */
    kind: TimerKind;
    /**
     * ForgeScript code it runs.
     */
    code: string;
    /**
     * Path of the command it was scheduled from.
     */
    path?: string | null;
    /**
     * Name of the command it was scheduled from.
     */
    commandName?: string | null;
    /**
     * Variable schema this row was written under.
     * Null predates it and means v0.
     */
    version?: number | null;
    /**
     * Delay of a timeout or tick length of an interval, in ms. Always 0 for a cron.
     */
    duration: number;
    /**
     * Cron expression, when it is a cron.
     */
    cron?: string | null;
    /**
     * Zone the expression is read in, null for the process zone.
     */
    timezone?: string | null;
    /**
     * When it was scheduled, unix ms.
     */
    timestamp: number;
    /**
     * When it is next due, unix ms.
     */
    fireAt: number;
    /**
     * When it was paused, null while running.
     */
    pausedAt?: number | null;
    /**
     * Guild it was scheduled in.
     */
    guildID?: Snowflake | null;
    /**
     * Channel it was scheduled in, if any.
     */
    channelID?: Snowflake | null;
    /**
     * User who scheduled it.
     */
    authorID?: Snowflake | null;
    /**
     * Message it was scheduled from.
     */
    messageID?: Snowflake | null;
    /**
     * Command arguments at scheduling time.
     */
    args?: string[];
    /**
     * Options the call spelled out.
     */
    config?: IStoredOverrides | null;
    /**
     * Variables at scheduling time, the serializable ones.
     */
    vars?: IPersistedVars;
    constructor(options?: ITimerStartOptions);
    /**
     * A timer with nothing but its identity, for reporting one that is already gone.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    static stub(kind: TimerKind, name: string): Timer;
    /**
     * Whether it keeps to an expression rather than a gap.
     */
    isCron(): this is Timer & {
        cron: string;
    };
    /**
     * Whether it is on hold, neither running nor falling behind.
     */
    isPaused(): boolean;
    /**
     * Rebuilds a timer from a stored row, for a backend that hands back plain data. Folds a pre-2.0.0 `hostID` into `authorID`.
     * @param data Row to rebuild.
     */
    static from(data: ITimer): Timer;
    /**
     * Builds the primary key for a timer.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    static idOf(kind: TimerKind, name: string): string;
    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind Timer kind.
     */
    static maxNameLength(kind: TimerKind): number;
    /**
     * Time left before it is due.
     */
    timeLeft(): number;
    /**
     * How long past due it is, 0 when not yet.
     */
    overdueBy(): number;
    /**
     * Whether it came due while the app was down.
     */
    isOverdue(): boolean;
    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     * @param limit Most worth counting. A cron counts them one by one.
     */
    missedTicks(limit?: number): number;
    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     */
    scheduleNext(): this;
    /**
     * Steps whole ticks into the future, keeping the phase. A slow run shifts by ticks, not by itself.
     */
    advance(): this;
}
export declare class MongoTimer extends Timer {
    /**
     * The object id for MongoDB.
     */
    mongoId?: string;
    /**
     * What builds before 2.0.0 wrote the author under, read beside {@link Timer.authorID} on mongo alone.
     */
    hostID?: Snowflake | null;
}
//# sourceMappingURL=Timer.d.ts.map