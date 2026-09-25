import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$timerExists",
    version: "2.0.0",
    description: "Checks whether a timer is stored under this name, running or not, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        Arg.requiredEnum(TimerKind, "kind", "The kind of the timer to look for"),
        Arg.requiredString("name", "The name of the timer to look for"),
    ],
    output: ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ForgeTimers.of(ctx.client).timersManager
        return this.success(await manager.exists(kind, name))
    },
})
