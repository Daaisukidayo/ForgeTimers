import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$clearInterval",
    version: "1.0.0",
    description: "Clears an active interval, returns bool",
    aliases: ["$stopInterval", "$deleteInterval"],
    unwrap: true,
    brackets: true,
    args: [Arg.requiredString("name", "The name of the interval")],
    output: ArgType.Boolean,
    async execute(ctx, [name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        const { cleared, forgotten } = await manager.stop(TimerKind.interval, name)
        return this.success(cleared || forgotten)
    },
})
