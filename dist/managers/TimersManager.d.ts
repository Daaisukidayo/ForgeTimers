import { ForgeClient } from "@tryforge/forgescript";
import { Timer, TimerKind } from "../structures";
export interface IStopResult {
    /** Whether a timer was actually running, or mid-run, under that name. */
    cleared: boolean;
    /** Whether a stored record was removed. */
    forgotten: boolean;
}
export declare class TimersManager {
    private readonly client;
    private readonly timers;
    private claims;
    private readonly generations;
    private readonly crons;
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
     * @returns Whether anything was stopped, whether it was scheduled or already mid-run.
     */
    clear(kind: TimerKind, name: string): boolean;
    private _save;
    private _forget;
    /** Reports how a one-shot ended, and spends its record only once the run is really over */
    private _settle;
    /**
     * @param previous The timer as it was before this event changed it, for `$oldTimer`.
     */
    private _report;
    /** A copy of a timer as it stands, to hand to an event once the original has moved on */
    private _snapshot;
    private _reportCancel;
    /**
     * Runs a task that holds a name outright, with nothing scheduled to hold it for them.
     *
     * The claim is always handed back, because a name left claimed by a run that never finished
     * would read as live for ever. Arming inside the task takes a claim of its own, and that one
     * is left alone.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @param task What to do while the name is held, given a check for whether it still is.
     */
    private _claimed;
    /** Takes the name over and hands back a check for whether it's still ours */
    private _claim;
    /**
     * Forgets a name nothing is armed under any more.
     */
    private _release;
    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether anything was stopped, and whether a stored record was removed.
     */
    stop(kind: TimerKind, name: string): Promise<IStopResult>;
    /**
     * Moves a stored timer's deadline, keeping everything else it was scheduled with.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @param duration The new delay for a timeout, or tick length for an interval, in ms.
     * @returns Whether a stored timer was found and moved.
     */
    reschedule(kind: TimerKind, name: string, duration: number): Promise<boolean>;
    /**
     * Gives a stored cron a new expression, keeping everything else it was scheduled with.
     *
     * @param name The name of the cron.
     * @param expression The cron expression it should run on from now on.
     * @param timezone The zone to read it in, or null to keep the one it already had.
     * @returns Whether a stored cron was found and moved.
     */
    rescheduleCron(name: string, expression: string, timezone?: string | null): Promise<boolean>;
    /**
     * Puts a stored timer on hold, keeping what is left of its wait for {@link resume}.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether a running timer was put on hold.
     */
    pause(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * Starts a paused timer, from wherever its wait was left.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether a paused timer was started.
     */
    resume(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * Runs a stored timer's code once, on demand.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether the code ran.
     */
    execute(kind: TimerKind, name: string): Promise<boolean>;
    /** The stored record for a name, or null when there is no backend or no such row */
    private _stored;
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
    /**
     * Stops everything armed and lets every name go, leaving the database alone.
     * Unlike {@link wipe} nothing is forgotten, so the next boot picks the records back up.
     */
    standDown(): void;
    /**
     * Whether a record is stored under this name, whatever is or is not armed for it.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    exists(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * A kind's config with the timer's own options laid over it, so a call beats the config.
     * @param timer The timer to resolve the config of.
     */
    private configFor;
    /** Arms `fn`, keeping the live map on the pending chunk so {@link clear} cancels the right one */
    /**
     * Why a stored cron could never be armed, or null when it can.
     * @param timer The cron to look over.
     */
    private _cronFault;
    private _schedule;
    private _arm;
    private _armTimeout;
    private _armRepeating;
    /**
     * Compiles now, fetches later.
     * @param timer The timer to build a runner for.
     */
    private _runnerFor;
    /**
     * Finds the live command.
     * @param timer The timer to look up.
     */
    private _commandFor;
    /** Fetches everything a run needs from discord */
    private _resolve;
    private _rebuildTarget;
    /**
     * Whether this process is the one meant to run a timer.
     *
     * @param timer The timer being restored.
     */
    private _owns;
    private _restore;
    /**
     * Drops a one-shot that's too late, otherwise fires or re-arms it.
     * @returns Whether it was kept, so the caller can count what startup saved.
     */
    private _restoreTimeout;
    /**
     * Resumes a stored repeating timer, replaying what it missed if it is allowed to.
     * @returns Always true: an interval past `maxOverdue` skips the stale tick.
     */
    private _restoreRepeating;
    private _assertNever;
    /**
     * Replays what was missed offline.
     * @param limit This timer's resolved `restoredTicksLimit`, its own beating its kind's.
     */
    private _replay;
}
//# sourceMappingURL=TimersManager.d.ts.map