import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$resumeTimer",
    version: "2.0.0",
    description: "Starts a paused timer again, from wherever its wait was left, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        Arg.requiredEnum(TimerKind, "kind", "The kind of the timer to resume"),
        Arg.requiredString("name", "The name of the timer to resume"),
    ],
    output: ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        return this.success(await manager.resume(kind, name))
    },
})
