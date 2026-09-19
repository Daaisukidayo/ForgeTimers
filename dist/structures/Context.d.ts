import { Context as BaseContext, IRunnable } from "@tryforge/forgescript";
import { GuildMember, User } from "discord.js";
import { Timer } from "./Timer";
import { ITimerEventData } from "../types";
export interface ITimerRunnable extends IRunnable {
    /** Scheduling user, refetched on restore - fills in once the original message is gone */
    host?: User | null;
    /**
     * The scheduling user as a guild member, when the timer belongs to a guild.
     */
    hostMember?: GuildMember | null;
    /**
     * The timer this run is about.
     */
    timer?: Timer | null;
    /**
     * What the event added on top of its timer, read by the `event/` natives
     */
    event?: ITimerEventData | null;
}
export declare class TimerContext extends BaseContext {
    readonly runtime: ITimerRunnable;
    constructor(runtime: ITimerRunnable);
    get user(): User | null;
    get member(): GuildMember | null;
    get timer(): Timer | null;
    get event(): ITimerEventData | null;
}
//# sourceMappingURL=Context.d.ts.map