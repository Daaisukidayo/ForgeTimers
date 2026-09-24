import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimerEventProperty } from "../../properties/event"
import { TimerContext } from "../../structures"

export default new NativeFunction({
    name: "$eventData",
    version: "2.0.0",
    description: "Returns what an event carries besides its timer",
    unwrap: true,
    brackets: false,
    args: [Arg.optionalEnum(TimerEventProperty, "property", "The property to return, or every one of them as JSON")],
    output: [ArgType.Json, ArgType.Unknown],
    execute(ctx, [property]) {
        const event = ctx instanceof TimerContext ? ctx.event : null
        if (!event) return this.success()

        if (!property) return this.successJSON(event)

        return this.success(event[property])
    },
})
