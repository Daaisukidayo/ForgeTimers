import { Snowflake } from "discord.js";
import { IPersistedVars } from "../functions/snapshotVars";
export declare enum TimerKind {
    timeout = "timeout",
    interval = "interval"
}
export interface ITimerStartOptions {
    /**
     * The name the timer was scheduled under. Unique per kind.
     */
    name: string;
    kind: TimerKind;
    /**
     * The ForgeScript code to run.
     */
    code: string;
    path?: string | null;
    /**
     * The name of the command this timer was scheduled from, used to find the live
     * command again on restore.
     */
    commandName?: string | null;
    /**
     * Delay for timeouts, tick length for intervals, in ms.
     */
    duration: number;
    guildID?: Snowflake | null;
    /**
     * Null when scheduled outside a channel.
    */
    channelID?: Snowflake | null;
    hostID?: Snowflake | null;
    messageID?: Snowflake | null;
    /**
     * The command arguments present when the timer was scheduled.
     */
    args?: string[];
    vars?: IPersistedVars;
}
export interface ITimer extends ITimerStartOptions {
    id: string;
    timestamp: number;
    /**
     * The variable schema this timer was written under.
     */
    version?: number | null;
    /**
     * Absolute unix ms timestamp of the next time this should fire.
     */
    fireAt: number;
}
export declare class Timer implements ITimer {
    /** What this build writes */
    static readonly SCHEMA_VERSION = 1;
    /** Primary keys are `varchar(255)` on mysql, and a longer id is rejected, not truncated */
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
    /** Variable schema this row was written under. Null predates it and means v0 */
    version?: number | null;
    /**
     * The delay of this timeout, or the tick length of this interval, in ms.
     */
    duration: number;
    /**
     * The timestamp this timer has been created at.
     */
    timestamp: number;
    /**
     * The timestamp this timer is next due to fire at.
     */
    fireAt: number;
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
     * The serializable variables present when this timer was scheduled.
     */
    vars?: IPersistedVars;
    constructor(options?: Partial<ITimerStartOptions>);
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
    missedTicks(): number;
    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     */
    scheduleNext(): this;
    /**
     * Steps whole ticks into the future, keeping the phase — a slow run shifts by ticks, not by itself.
     */
    advance(): this;
    /**
     * Clones this timer.
     */
    clone(): this;
}
export declare class MongoTimer extends Timer {
    /**
     * The object id for MongoDB.
     */
    mongoId?: string;
}
//# sourceMappingURL=Timer.d.ts.map