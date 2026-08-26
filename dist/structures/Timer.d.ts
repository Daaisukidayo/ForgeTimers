import "reflect-metadata";
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
     * Delay for timeouts, tick length for intervals, in ms.
     */
    duration: number;
    guildID?: Snowflake | null;
    channelID: Snowflake;
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
     * Absolute unix ms timestamp of the next time this should fire.
     */
    fireAt: number;
}
export declare class Timer implements ITimer {
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
     * The id of the channel this timer has been created in.
     */
    channelID: Snowflake;
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
     * Builds the primary key for a timer.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    static idOf(kind: TimerKind, name: string): string;
    /**
     * Returns the time left before this timer is due.
     * @returns
     */
    timeLeft(): number;
    /**
     * Returns how long past due this timer is, or 0 if it isn't yet.
     * @returns
     */
    overdueBy(): number;
    /**
     * Returns whether this timer was due while the app was down.
     * @returns
     */
    isOverdue(): boolean;
    /**
     * Returns how many ticks elapsed since this timer was last due.
     * Always 0 for timeouts, which only ever fire once.
     * @returns
     */
    missedTicks(): number;
    /**
     * Moves this timer's due time to the next tick.
     * @returns
     */
    scheduleNext(): this;
    /**
     * Clones this timer.
     * @returns
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