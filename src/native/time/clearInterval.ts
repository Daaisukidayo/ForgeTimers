import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$clearInterval",
    version: "1.0.0",
    description: "Clears an active interval, returns bool",
    aliases: ["$stopInterval"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "name",
            description: "The name of the interval",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Boolean,
    async execute(ctx, [name]) {
        const manager = ctx.client.getExtension(ForgeTimers, true).timersManager
        const [cleared, forgotten] = await manager.stop(TimerKind.interval, name)
        return this.success(cleared || forgotten)
    },
})