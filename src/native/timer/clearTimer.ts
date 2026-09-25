import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$clearTimer",
    version: "2.0.0",
    description: "Cancels a timer of any kind and forgets it, returns bool",
    aliases: ["$stopTimer", "$deleteTimer"],
    unwrap: true,
    brackets: true,
    args: [
        Arg.requiredEnum(TimerKind, "kind", "The kind of the timer to cancel"),
        Arg.requiredString("name", "The name of the timer to cancel"),
    ],
    output: ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        const { cleared, forgotten } = await manager.stop(kind, name)

        return this.success(cleared || forgotten)
    },
})
