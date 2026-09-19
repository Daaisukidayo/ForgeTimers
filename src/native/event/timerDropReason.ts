import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimerContext } from "../../structures"

export default new NativeFunction({
    name: "$timerDropReason",
    version: "2.0.0",
    description: "Returns why a timerDrop event's timer was thrown away without running",
    unwrap: true,
    output: ArgType.String,
    execute(ctx) {
        const event = ctx instanceof TimerContext ? ctx.event : null
        return this.success(event?.dropReason)
    },
})
