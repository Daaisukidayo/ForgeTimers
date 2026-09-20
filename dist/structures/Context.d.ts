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
    /** Scheduling user, refetched on restore - fills in once the original message is gone */
    author?: User | null;
    /**
     * The scheduling user as a guild member, when the timer belongs to a guild.
     */
    authorMember?: GuildMember | null;
    /**
     * The timer this run is about.
     */
    timer?: Timer | null;
    /**
     * What the event added on top of its timer, read by the `event/` natives
     */
    event?: ITimerEventData | null;
}
/**
 * Builds the runner for a scheduled timer.
 *
 * @param ctx The context the timer was scheduled from.
 * @param resolve What to run, given the context built for that run.
 * @returns The runtime the snapshot came from, the runner, and a way to hand it its timer.
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
    get timer(): Timer | null;
    get event(): ITimerEventData | null;
}
//# sourceMappingURL=Context.d.ts.map