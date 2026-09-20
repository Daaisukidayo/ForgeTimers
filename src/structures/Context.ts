import { Context as BaseContext, IRunnable } from "@tryforge/forgescript"
import { GuildMember, User } from "discord.js"
import { Timer } from "./Timer"
import { ITimerEventData } from "../types"

declare module "@tryforge/forgescript" {
    interface IStates {
        timer: Timer
    }
}

export interface ITimerRunnable extends IRunnable {
    /** Scheduling user, refetched on restore - fills in once the original message is gone */
    author?: User | null

    /**
     * The scheduling user as a guild member, when the timer belongs to a guild.
     */
    authorMember?: GuildMember | null

    /**
     * The timer this run is about.
     */
    timer?: Timer | null

    /**
     * What the event added on top of its timer, read by the `event/` natives
     */
    event?: ITimerEventData | null
}

/**
 * Builds the runner for a scheduled timer.
 *
 * @param ctx The context the timer was scheduled from.
 * @param resolve What to run, given the context built for that run.
 * @returns The runtime the snapshot came from, the runner, and a way to hand it its timer.
 */
export function snapshotRunner(ctx: BaseContext, resolve: (tick: BaseContext) => Promise<unknown>) {
    const runtime = ctx.cloneRuntime()

    const vars = {
        keywords: { ...runtime.keywords },
        environment: { ...runtime.environment },
        localFunctions: { ...runtime.localFunctions },
    }

    const carried: { timer?: Timer } = {}

    const run = async () => {
        const tick = new TimerContext({
            ...runtime,
            keywords: { ...vars.keywords },
            environment: { ...vars.environment },
            localFunctions: { ...vars.localFunctions },
            timer: carried.timer,
        })

        await resolve(tick)
    }

    return { runtime, run, carries: (timer: Timer) => void (carried.timer = timer) }
}

export class TimerContext extends BaseContext {
    public constructor(public readonly runtime: ITimerRunnable) {
        super(runtime)
    }

    public override get user() {
        return super.user ?? this.runtime.author ?? null
    }

    public override get member() {
        return super.member ?? this.runtime.authorMember ?? null
    }

    public get timer() {
        return this.runtime.timer ?? null
    }

    public get event() {
        return this.runtime.event ?? null
    }
}
