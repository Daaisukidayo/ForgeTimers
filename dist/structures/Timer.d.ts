import { Snowflake } from "discord.js";
import { IPersistedVars } from "../functions/snapshotVars";
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
     * The name of the command this timer was scheduled from.
     */
    commandName?: string | null;
    guildID?: Snowflake | null;
    channelID?: Snowflake | null;
    hostID?: Snowflake | null;
    messageID?: Snowflake | null;
    /**
     * The command arguments present when the timer was scheduled.
     */
    args?: string[];
    /**
     * The options this timer was scheduled with.
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
     * The zone that expression is read in, or null for whatever the process runs in.
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
     * The zone that expression is read in, or null for whatever the process runs in.
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
     * What this build writes.
     */
    static readonly SCHEMA_VERSION = 1;
    /**
     * Primary keys are `varchar(255)` on mysql, and a longer id is rejected.
     */
    static readonly MAX_ID_LENGTH = 255;
    /**
     * The id of this timer, in the form `kind:name`.
     */
    id: string;
    /**
     * The name this timer was scheduled under.
     */
    name: string;
    /**
     * The kind of the timer.
     */
    kind: TimerKind;
    /**
     * The ForgeScript code this timer executes.
     */
    code: string;
    /**
     * The path of the command this timer was scheduled from.
     */
    path?: string | null;
    /**
     * The name of the command this timer was scheduled from.
     */
    commandName?: string | null;
    /**
     * Variable schema this row was written under.
     * Null predates it and means v0.
     */
    version?: number | null;
    /**
     * The delay of this timeout, or the tick length of this interval, in ms. Always 0 for a cron.
     */
    duration: number;
    /**
     * The cron expression this timer runs on, when it is one.
     */
    cron?: string | null;
    /**
     * The zone that expression is read in, or null for whatever the process runs in.
     */
    timezone?: string | null;
    /**
     * The timestamp this timer has been created at.
     */
    timestamp: number;
    /**
     * The timestamp this timer is next due to fire at.
     */
    fireAt: number;
    /**
     * The timestamp this timer was paused at, or null while it is running.
     */
    pausedAt?: number | null;
    /**
     * The id of the guild this timer has been created on.
     */
    guildID?: Snowflake | null;
    /**
     * The id of the channel this timer has been created in, if any.
     */
    channelID?: Snowflake | null;
    /**
     * The id of the user that scheduled this timer.
     */
    hostID?: Snowflake | null;
    /**
     * The id of the message this timer was scheduled from.
     */
    messageID?: Snowflake | null;
    /**
     * The command arguments this timer was scheduled with.
     */
    args?: string[];
    /**
     * The options this timer was scheduled with.
     */
    config?: IStoredOverrides | null;
    /**
     * The serializable variables present when this timer was scheduled.
     */
    vars?: IPersistedVars;
    constructor(options?: ITimerStartOptions);
    /**
     * A timer with nothing but its identity, for reporting one that is already gone.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    static stub(kind: TimerKind, name: string): Timer;
    /**
     * Whether this timer keeps to an expression rather than to a gap.
     */
    isCron(): this is Timer & {
        cron: string;
    };
    /**
     * Whether this timer is on hold, and so neither running nor falling behind.
     */
    isPaused(): boolean;
    /**
     * Rebuilds a timer from a stored row, for a backend that hands back plain data.
     * @param data The row to rebuild from.
     */
    static from(data: ITimer): Timer;
    /**
     * Builds the primary key for a timer.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    static idOf(kind: TimerKind, name: string): string;
    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind The kind of the timer.
     */
    static maxNameLength(kind: TimerKind): number;
    /**
     * Returns the time left before this timer is due.
     */
    timeLeft(): number;
    /**
     * Returns how long past due this timer is, or 0 if it isn't yet.
     */
    overdueBy(): number;
    /**
     * Returns whether this timer was due while the app was down.
     */
    isOverdue(): boolean;
    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     */
    missedTicks(limit?: number): number;
    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     */
    scheduleNext(): this;
    /**
     * Steps whole ticks into the future, keeping the phase — a slow run shifts by ticks, not by itself.
     */
    advance(): this;
}
export declare class MongoTimer extends Timer {
    /**
     * The object id for MongoDB.
     */
    mongoId?: string;
}
//# sourceMappingURL=Timer.d.ts.map