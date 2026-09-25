import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$clearCron",
    version: "2.0.0",
    description: "Clears an active cron, returns bool",
    aliases: ["$stopCron", "$deleteCron"],
    unwrap: true,
    brackets: true,
    args: [Arg.requiredString("name", "The name of the cron")],
    output: ArgType.Boolean,
    async execute(ctx, [name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        const { cleared, forgotten } = await manager.stop(TimerKind.cron, name)

        return this.success(cleared || forgotten)
    },
})
