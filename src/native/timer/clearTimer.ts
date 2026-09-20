import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$clearTimer",
    version: "2.0.0",
    description: "Cancels a timer of any kind and forgets it, returns bool",
    aliases: ["$stopTimer", "$deleteTimer"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "kind",
            description: "The kind of the timer to cancel",
            rest: false,
            required: true,
            type: ArgType.Enum,
            enum: TimerKind,
        },
        {
            name: "name",
            description: "The name of the timer to cancel",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ctx.client.getExtension(ForgeTimers, true).timersManager
        const { cleared, forgotten } = await manager.stop(kind, name)

        return this.success(cleared || forgotten)
    },
})
