import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { answer, TimerProperty } from "../../properties/timer"

export default new NativeFunction({
    name: "$oldTimer",
    version: "2.0.0",
    description: "Retrieves a timer as it was before the event changed it",
    unwrap: true,
    brackets: true,
    args: [Arg.requiredEnum(TimerProperty, "property", "The property to pull")],
    output: [ArgType.Json, ArgType.Unknown],
    execute(ctx, [property]) {
        const old = ctx.states?.timer?.old
        if (!old) return this.success()
        return answer(this, old, property)
    },
})
