import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$clearTimeout",
    version: "1.0.0",
    description: "Clears an active timeout, returns bool",
    aliases: ["$stopTimeout", "$deleteTimeout"],
    unwrap: true,
    brackets: true,
    args: [Arg.requiredString("name", "The name of the timeout")],
    output: ArgType.Boolean,
    async execute(ctx, [name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        const { cleared, forgotten } = await manager.stop(TimerKind.timeout, name)
        return this.success(cleared || forgotten)
    },
})
