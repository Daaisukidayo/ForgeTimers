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
    /** Who scheduled it, refetched on restore. Wins over the target's own author */
    author?: User | null

    /**
     * The same user as a guild member, when the timer has a guild.
     */
    authorMember?: GuildMember | null

    /**
     * Timer this run is about, for `$timerData`.
     */
    timer?: Timer | null

    /**
     * Event extras, for `$eventData`.
     */
    event?: ITimerEventData | null
}

/**
 * Runner for a timer scheduled live. Every tick gets fresh copies of the snapshot vars.
 * @param ctx Context the timer was scheduled from.
 * @param resolve What to run, given the tick's context.
 * @returns Runtime the snapshot came from, the runner, and `carries` to hand it its timer.
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
        return this.runtime.author ?? super.user ?? null
    }

    public override get member() {
        return this.runtime.authorMember ?? super.member ?? null
    }

    public override cloneEmpty() {
        return new TimerContext({ ...this.runtime })
    }

    public get timer() {
        return this.runtime.timer ?? null
    }

    public get event() {
        return this.runtime.event ?? null
    }
}
