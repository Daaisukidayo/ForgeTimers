import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$pauseTimer",
    version: "2.0.0",
    description: "Puts a stored timer on pause, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        Arg.requiredEnum(TimerKind, "kind", "The kind of the timer to pause"),
        Arg.requiredString("name", "The name of the timer to pause"),
    ],
    output: ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        return this.success(await manager.pause(kind, name))
    },
})
