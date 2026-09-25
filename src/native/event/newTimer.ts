import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { answer, TimerProperty } from "../../properties/timer"

export default new NativeFunction({
    name: "$newTimer",
    version: "2.0.0",
    description: "Retrieves a timer as the event left it",
    unwrap: true,
    brackets: true,
    args: [Arg.requiredEnum(TimerProperty, "property", "The property to pull")],
    output: [ArgType.Json, ArgType.Unknown],
    execute(ctx, [property]) {
        const fresh = ctx.states?.timer?.new
        if (!fresh) return this.success()
        return answer(this, fresh, property)
    },
})
