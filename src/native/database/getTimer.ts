import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { answer, readProperties, TimerProperty } from "../../properties/timer"
import { Database, ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$getTimer",
    version: "1.1.0",
    description: "Gets an existing timer from the database",
    unwrap: true,
    brackets: true,
    args: [
        Arg.requiredEnum(TimerKind, "kind", "The kind of the timer to look for"),
        Arg.requiredString("name", "The name of the timer to get"),
        Arg.optionalEnum(TimerProperty, "property", "The property of the timer to return")
    ],
    output: [
        ArgType.Json,
        ArgType.Unknown
    ],
    async execute(ctx, [kind, name, prop]) {
        if (!(await ForgeTimers.of(ctx.client).ready)) return this.success()

        const timer = await Database.get(kind, name)
        if (!timer) return this.success()

        if (prop) return answer(this, timer, prop)
        return this.successJSON(readProperties(timer))
    }
})