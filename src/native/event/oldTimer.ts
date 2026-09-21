import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { isStructured, TimerProperties, TimerProperty } from "../../properties/timer"

export default new NativeFunction({
    name: "$oldTimer",
    version: "2.0.0",
    description: "Retrieves a timer as it was before the event changed it",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "property",
            description: "The property to pull",
            rest: false,
            required: true,
            type: ArgType.Enum,
            enum: TimerProperty,
        },
    ],
    output: [ArgType.Json, ArgType.Unknown],
    execute(ctx, [property]) {
        const old = ctx.states?.timer?.old
        if (!old) return this.success()

        const value = TimerProperties[property](old)
        return isStructured(value) ? this.successJSON(value) : this.success(value)
    },
})
