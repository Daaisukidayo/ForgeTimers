import { ForgeClient } from "@tryforge/forgescript";
import { Timer, TimerKind } from "../structures";
export declare class TimersManager {
    private readonly client;
    private readonly timers;
    private claims;
    private readonly generations;
    constructor(client: ForgeClient);
    /**
     * Schedules a timer and persists it.
     * @param timer The timer to schedule.
     * @param run What it executes when it fires.
     */
    start(timer: Timer, run: () => Promise<void>): Promise<Timer>;
    /**
     * Cancels a running timer, leaving the database untouched.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    clear(kind: TimerKind, name: string): boolean;
    private _save;
    private _forget;
    /** Reports how a one-shot ended, and spends its record only once the run is really over */
    private _settle;
    private _report;
    private _reportCancel;
    /** Takes the name over and hands back a check for whether it's still ours */
    private _claim;
    /**
     * Forgets a name nothing is armed under any more. Whoever still holds its claim reads undefined
     * and stands down, the same as being superseded.
     */
    private _release;
    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether it was running, and whether a stored record was removed.
     */
    stop(kind: TimerKind, name: string): Promise<[boolean, boolean]>;
    /**
     * Cancels every running timer and empties the table.
     * @returns The number of running timers that were cancelled.
     */
    wipe(): Promise<number>;
    /**
     * The live timer map ForgeScript keeps for a kind.
     * @param kind The kind of the timers.
     */
    mapOf(kind: TimerKind): Map<string, NodeJS.Timeout> | undefined;
    /**
     * Whether a timer under this name is already running.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    isLive(kind: TimerKind, name: string): boolean;
    private configOf;
    /** Arms `fn`, keeping the live map on the pending chunk so {@link clear} cancels the right one */
    private _schedule;
    private _arm;
    private _armTimeout;
    private _armInterval;
    /**
     * Compiles now, fetches later. Boot stays free of requests, and a distant timer isn't
     * thrown away over an outage happening today.
     * @param timer The timer to build a runner for.
     */
    private _runnerFor;
    /**
     * Finds the live command again, so a restored run reads the same `$commandName`.
     * @param timer The timer to look up.
     */
    private _commandFor;
    /** Fetches everything a run needs from discord */
    private _resolve;
    private _rebuildTarget;
    /** What we can't see is left alone — it's a sibling shard or an outage. Deleting is opt-in */
    private _owns;
    private _restore;
    /** Drops a one-shot that's too late, otherwise fires or re-arms it */
    private _restoreTimeout;
    private _restoreInterval;
    private _assertNever;
    /** Replays what was missed offline, up to `restoredTicksLimit` */
    private _replay;
}
//# sourceMappingURL=TimersManager.d.ts.map