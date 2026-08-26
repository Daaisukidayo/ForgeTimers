import { Context as BaseContext, IRunnable } from "@tryforge/forgescript";
import { GuildMember, User } from "discord.js";
export interface ITimerRunnable extends IRunnable {
    /**
     * The user that scheduled the timer, refetched on restore,
     * fills in when `obj` is a bare channel,
     * which happens once the original message is gone.
     */
    host?: User | null;
    /**
     * The scheduling user as a guild member, when the timer belongs to a guild.
     */
    hostMember?: GuildMember | null;
}
export declare class TimerContext extends BaseContext {
    readonly runtime: ITimerRunnable;
    constructor(runtime: ITimerRunnable);
    get user(): User | null;
    get member(): GuildMember | null;
}
//# sourceMappingURL=Context.d.ts.map