import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimerProperties, TimerProperty } from "../../properties/timer"

export default new NativeFunction({
    name: "$newTimer",
    version: "2.0.0",
    description: "Retrieves a timer as the event left it",
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
    output: ArgType.Unknown,
    execute(ctx, [property]) {
        const fresh = ctx.states?.timer?.new
        if (!fresh) return this.success()

        return this.success(TimerProperties[property](fresh))
    },
})
