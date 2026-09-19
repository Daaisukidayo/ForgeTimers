import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimerContext } from "../../structures"

export default new NativeFunction({
    name: "$timersDropped",
    version: "2.0.0",
    description: "Returns how many stored timers the timersReady event threw away",
    unwrap: true,
    output: ArgType.Number,
    execute(ctx) {
        const event = ctx instanceof TimerContext ? ctx.event : null
        return this.success(event?.dropped)
    },
})
