import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { isStructured, readProperties, TimerProperties, TimerProperty } from "../../properties/timer"
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

        const value = TimerProperties[prop](timer)
        return isStructured(value) ? this.successJSON(value) : this.success(value)
    },
})
