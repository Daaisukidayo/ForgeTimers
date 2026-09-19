import { Context as BaseContext, IRunnable } from "@tryforge/forgescript"
import { GuildMember, User } from "discord.js"
import { Timer } from "./Timer"
import { ITimerEventData } from "../types"

export interface ITimerRunnable extends IRunnable {
    /** Scheduling user, refetched on restore - fills in once the original message is gone */
    host?: User | null

    /**
     * The scheduling user as a guild member, when the timer belongs to a guild.
     */
    hostMember?: GuildMember | null

    /**
     * The timer this run is about.
     */
    timer?: Timer | null

    /**
     * What the event added on top of its timer, read by the `event/` natives
     */
    event?: ITimerEventData | null
}

export class TimerContext extends BaseContext {
    public constructor(public readonly runtime: ITimerRunnable) {
        super(runtime)
    }

    public override get user() {
        return super.user ?? this.runtime.host ?? null
    }

    public override get member() {
        return super.member ?? this.runtime.hostMember ?? null
    }

    public get timer() {
        return this.runtime.timer ?? null
    }

    public get event() {
        return this.runtime.event ?? null
    }
}
