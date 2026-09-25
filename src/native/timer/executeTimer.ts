import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$executeTimer",
    version: "2.0.0",
    description: "Runs a stored timer's code now without touching the timer itself, returns bool",
    aliases: ["$runTimer"],
    unwrap: true,
    brackets: true,
    args: [
        Arg.requiredEnum(TimerKind, "kind", "The kind of the timer to run"),
        Arg.requiredString("name", "The name of the timer to run"),
    ],
    output: ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        return this.success(await manager.execute(kind, name))
    },
})
