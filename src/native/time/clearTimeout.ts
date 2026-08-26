import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$clearTimeout",
    version: "1.0.0",
    description: "Clears an active timeout, returns bool",
    aliases: ["$stopTimeout"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "name",
            description: "The name of the timeout",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Boolean,
    async execute(ctx, [name]) {
        const manager = ctx.client.getExtension(ForgeTimers, true).timersManager
        return this.success(await manager.stop(TimerKind.timeout, name))
    },
})