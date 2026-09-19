import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$timerRunning",
    version: "2.0.0",
    description: "Checks whether a timer is running right now, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "kind",
            description: "The kind of the timer to look for",
            rest: false,
            required: true,
            type: ArgType.Enum,
            enum: TimerKind,
        },
        {
            name: "name",
            description: "The name of the timer to look for",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Boolean,
    execute(ctx, [kind, name]) {
        const manager = ctx.client.getExtension(ForgeTimers, true).timersManager
        return this.success(manager.isLive(kind, name))
    },
})
