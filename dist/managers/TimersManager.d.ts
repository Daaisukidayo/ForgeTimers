import { ForgeClient } from "@tryforge/forgescript";
import { Timer, TimerKind } from "../structures";
export declare class TimersManager {
    private readonly client;
    private readonly timers;
    constructor(client: ForgeClient);
    /**
     * Schedules a timer and persists it.
     * @param options The timer to schedule.
     * @returns
     */
    start(timer: Timer, run: () => Promise<void>): Promise<Timer>;
    /**
     * Cancels a running timer, leaving the database untouched.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    clear(kind: TimerKind, name: string): boolean;
    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    stop(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * Cancels every stored timer and empties the table.
     * @returns The number of running timers that were cancelled.
     */
    wipe(): Promise<number>;
    /**
     * The live timer map ForgeScript keeps for a kind.
     * @param kind The kind of the timers.
     * @returns
     */
    mapOf(kind: TimerKind): Map<string, NodeJS.Timeout> | undefined;
    /**
     * Whether a timer under this name is already running.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    isLive(kind: TimerKind, name: string): boolean;
    private configOf;
    private _arm;
    /**
     * Rebuilds a runner for a stored timer, recompiling its code and
     * refetching the channel or message it was scheduled from.
     * @param timer The timer to build a runner for.
     * @returns
     */
    private _runnerFor;
    private _rebuildTarget;
    /**
     * Whether this process should restore a given timer.
     */
    private _owns;
    private _restore;
    /** Drops a one-shot timer that's too late, otherwise fires or re-arms it. */
    private _restoreTimeout;
    private _restoreInterval;
    private _assertNever;
    /**
     * Replays ticks that elapsed while the app was offline, honouring `restoredTicksLimit`.
     */
    private _replay;
}
//# sourceMappingURL=TimersManager.d.ts.map