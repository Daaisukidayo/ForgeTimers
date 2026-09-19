import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimerContext } from "../../structures"

export default new NativeFunction({
    name: "$timerOverdueBy",
    version: "2.0.0",
    description: "Returns how late a restored or dropped timer was, in ms",
    unwrap: true,
    output: ArgType.Number,
    execute(ctx) {
        const event = ctx instanceof TimerContext ? ctx.event : null
        return this.success(event?.overdueBy)
    },
})
