import { ForgeClient } from "@tryforge/forgescript";
import { Timer, TimerKind } from "../structures";
export interface IStopResult {
    /** Something was armed or mid-run under the name. */
    cleared: boolean;
    /** A row got deleted. */
    forgotten: boolean;
}
export declare class TimersManager {
    private readonly client;
    private readonly timers;
    private claims;
    private readonly generations;
    /** Last queued write per timer. Only `_queue` writes here. */
    private readonly writes;
    /** Timeouts mid-run. */
    private readonly firing;
    /**
     * Restores stored timers once the client is ready and storage is open.
     * @param client Client the timers run on.
     */
    constructor(client: ForgeClient);
    /**
     * Arms and stores a new timer. Anything under the same name gets replaced.
     * @param timer Timer to start.
     * @param run Its code, already bound to the calling context.
     */
    start(timer: Timer, run: () => Promise<void>): Promise<Timer>;
    /**
     * Disarms only, the row stays. Use `stop` to forget it too.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns True if something was armed or mid-run.
     */
    clear(kind: TimerKind, name: string): boolean;
    /**
     * Every write for one timer goes through here, in call order.
     * Skip it and a tick landing late can undo a pause.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param write Runs once earlier writes have landed.
     */
    private _queue;
    /**
     * Pending writes for this timer. Await before reading the row.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private _settled;
    /**
     * Read, change and write in one queue turn.
     * Inside `change` write through Database directly, `_save` would wait on itself.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param change Gets the stored timer, or null.
     * @returns Whatever `change` said, false with no backend.
     */
    private _locked;
    /**
     * Queued write of the timer as it is now.
     * @param timer Timer to write.
     */
    private _save;
    /**
     * Tick write. Dropped if the name changed hands before its turn, the new owner already wrote.
     * @param timer Timer to write.
     * @param owns Checked when the turn comes, not now.
     */
    private _saveHeld;
    /**
     * Queued delete of the row.
     * @param timer Timer to forget.
     */
    private _forget;
    /**
     * Runs a timeout and spends it. Pause and reschedule refuse it until done, or it runs twice.
     * @param timer Timeout that fires.
     * @param run What it runs.
     * @param owns Whether the name is still ours.
     */
    private _fire;
    /**
     * Reports the fire and drops the row. On an outage (`ran` false) the row stays for the next boot.
     * @param timer Timeout that ran.
     * @param outcome How the run went.
     */
    private _settle;
    /**
     * Emits only with listeners. A throwing listener gets logged, never rethrown.
     * @param name Event to emit.
     * @param timer For `$timerData` and `$newTimer`.
     * @param event Extras for `$eventData`.
     * @param previous For `$oldTimer`.
     */
    private _report;
    /**
     * Copy for events. The original keeps changing after the report.
     * @param timer Timer to copy.
     */
    private _snapshot;
    /**
     * timerCancel with the stored row, or a stub when only an armed timer existed.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param wasLive Report a stub even without a row.
     */
    private _reportCancel;
    /**
     * Holds the name for a restored run with nothing armed yet.
     * Always releases, else the name reads live forever.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param task Gets a check for whether the name is still held.
     */
    private _claimed;
    /**
     * Takes the name. The check turns false once anyone claims it after.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private _claim;
    /**
     * Drops the claim. Only when nothing is armed under the name.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private _release;
    /**
     * Disarms and deletes the row. The delete waits behind any tick still writing.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether something was armed, and whether a row went.
     */
    stop(kind: TimerKind, name: string): Promise<IStopResult>;
    /**
     * New duration, everything else kept. Refuses crons, firing timeouts and code that no longer compiles.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param duration New delay or tick length, in ms.
     * @returns Whether a stored timer moved.
     */
    reschedule(kind: TimerKind, name: string, duration: number): Promise<boolean>;
    /**
     * New expression for a stored cron. Check it before `clear`, a bad one would leave the cron cancelled.
     * @param name Cron name.
     * @param expression Expression to run on from now.
     * @param timezone Zone to read it in, null keeps the old one.
     * @returns Whether a stored cron moved.
     */
    rescheduleCron(name: string, expression: string, timezone?: string | null): Promise<boolean>;
    /**
     * Holds a timer, keeping what is left of its wait. Refuses a firing timeout.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether it got held.
     */
    pause(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * Restarts a held timer from what was left. A cron jumps to its next occurrence instead.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether it restarted.
     */
    resume(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * Runs the stored code once. Schedule, row and events stay untouched.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether the code ran.
     */
    execute(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * The row once pending writes land. null without a backend.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private _stored;
    /**
     * Disarms everything and empties storage. Waits for writes in flight first, or they bring rows back.
     * @returns How many armed timers got cancelled.
     */
    wipe(): Promise<number>;
    /**
     * Handle map for a kind, all three on the client. The cron one is ours, set in `init`.
     * @param kind Timer kind.
     */
    mapOf(kind: TimerKind): Map<string, NodeJS.Timeout> | undefined;
    /**
     * Armed or claimed in this process. Says nothing about the row.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    isLive(kind: TimerKind, name: string): boolean;
    /**
     * Disarms everything, keeps the rows. The next boot restores them.
     */
    standDown(): void;
    /**
     * Is there a row? Whatever is armed does not matter.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    exists(kind: TimerKind, name: string): Promise<boolean>;
    /**
     * Kind config with the timer's own options on top.
     * @param timer Timer to resolve for.
     */
    private configFor;
    /**
     * Why this cron cannot be armed, null when it can.
     * @param timer Cron to check.
     */
    private _cronFault;
    /**
     * setLongTimeout plus the map entry. The map holds the pending chunk, the one `clear` has to cancel.
     * A throw inside gets logged, the timer stays as it was.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param delay Wait in ms.
     * @param fn Tick body.
     */
    private _schedule;
    /**
     * Claims the name and schedules by kind.
     * @param timer Timer to arm.
     * @param run What it runs.
     */
    private _arm;
    /**
     * One run, then the row is spent. Checks the claim before running, an orphaned handle must not fire.
     * @param timer Timeout to schedule.
     * @param run What it runs.
     * @param owns Whether the name is still ours.
     */
    private _armTimeout;
    /**
     * Writes the next due time, re-arms, then runs. Lost the name during the write? Stop there.
     * @param timer Interval or cron to schedule.
     * @param run What it runs every tick.
     * @param owns Whether the name is still ours.
     */
    private _armRepeating;
    /**
     * Compiles now, fetches from discord on the first run.
     * @param timer Timer to build a runner for.
     */
    private _runnerFor;
    /**
     * The runner, or null with a warning when the timer can't run.
     * @param timer Timer to build a runner for.
     * @param doing What the caller was about to do, for the warning.
     */
    private _runnable;
    /**
     * Live command by path, then by name. null once it is gone.
     * @param timer Timer to look up.
     */
    private _commandFor;
    /**
     * Target, author and member for a restored run. Author gets refetched unless the target is theirs.
     * @param timer Timer about to run.
     */
    private _resolve;
    /**
     * Message, else channel, else nothing. A 404 channel still runs, other errors retry next boot.
     * @param timer Timer to rebuild the target for.
     */
    private _rebuildTarget;
    /**
     * Should this process run it? Guildless ones go to shard 0, the rest by the shard formula.
     * Unknown guilds stay unless pruneUnknownGuilds, it may be an outage.
     * @param timer Timer being restored.
     */
    private _owns;
    /**
     * Re-arms stored timers on boot and drops what cannot run. Due runs start after the scan.
     */
    private _restore;
    /**
     * Drops it if too late, queues it if due, arms it otherwise.
     * @param timer Timeout being restored.
     * @param timing Lateness and the config judging it.
     * @param run What it runs.
     * @param dueNow Runs already due, started after the scan.
     * @returns Whether it was kept, for the timersReady count.
     */
    private _restoreTimeout;
    /**
     * Skips to the schedule if too late, replays up to the limit if due, arms it otherwise.
     * @param timer Interval or cron being restored.
     * @param timing Lateness and the config judging it.
     * @param run What it runs every tick.
     * @param dueNow Replays already due, started after the scan.
     * @returns Always true, lateness costs a tick and not the timer.
     */
    private _restoreRepeating;
    /**
     * Unknown kind, likely stored by a newer build. Warn and skip.
     * @param kind Kind nothing handles.
     * @param name Timer name.
     */
    private _assertNever;
    /**
     * Runs missed ticks up to the limit. Stops on an outage or a lost name.
     * @param timer Interval or cron being restored.
     * @param missed Ticks missed while down.
     * @param limit Resolved restoredTicksLimit, the timer's own beats its kind's.
     * @param run What it runs every tick.
     * @param owns Whether the name is still ours.
     */
    private _replay;
}
//# sourceMappingURL=TimersManager.d.ts.map