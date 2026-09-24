import { Context as BaseContext, IRunnable } from "@tryforge/forgescript";
import { GuildMember, User } from "discord.js";
import { Timer } from "./Timer";
import { ITimerEventData } from "../types";
declare module "@tryforge/forgescript" {
    interface IStates {
        timer: Timer;
    }
}
export interface ITimerRunnable extends IRunnable {
    /** Who scheduled it, refetched on restore. Wins over the target's own author */
    author?: User | null;
    /**
     * The same user as a guild member, when the timer has a guild.
     */
    authorMember?: GuildMember | null;
    /**
     * Timer this run is about, for `$timerData`.
     */
    timer?: Timer | null;
    /**
     * Event extras, for `$eventData`.
     */
    event?: ITimerEventData | null;
}
/**
 * Runner for a timer scheduled live. Every tick gets fresh copies of the snapshot vars.
 * @param ctx Context the timer was scheduled from.
 * @param resolve What to run, given the tick's context.
 * @returns Runtime the snapshot came from, the runner, and `carries` to hand it its timer.
 */
export declare function snapshotRunner(ctx: BaseContext, resolve: (tick: BaseContext) => Promise<unknown>): {
    runtime: IRunnable;
    run: () => Promise<void>;
    carries: (timer: Timer) => undefined;
};
export declare class TimerContext extends BaseContext {
    readonly runtime: ITimerRunnable;
    constructor(runtime: ITimerRunnable);
    get user(): User | null;
    get member(): GuildMember | null;
    cloneEmpty(): TimerContext;
    get timer(): Timer | null;
    get event(): ITimerEventData | null;
}
//# sourceMappingURL=Context.d.ts.map