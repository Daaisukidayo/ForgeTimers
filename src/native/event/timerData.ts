import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { readProperties, TimerProperties, TimerProperty } from "../../properties/timer"
import { TimerContext } from "../../structures"

export default new NativeFunction({
    name: "$timerData",
    version: "2.0.0",
    description: "Returns what an event's timer was scheduled with",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "property",
            description: "The property to return, or every one of them as JSON",
            rest: false,
            type: ArgType.Enum,
            enum: TimerProperty,
        },
    ],
    output: [ArgType.Json, ArgType.Unknown],
    execute(ctx, [prop]) {
        const timer = ctx instanceof TimerContext ? ctx.timer : null
        if (!timer) return this.success()

        if (!prop) return this.successJSON(readProperties(timer))

        return this.successJSON(TimerProperties[prop](timer))
    },
})
