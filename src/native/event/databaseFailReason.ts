import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimerContext } from "../../structures"

export default new NativeFunction({
    name: "$databaseFailReason",
    version: "2.0.0",
    description: "Returns why the databaseFail event's storage could not be opened",
    unwrap: true,
    output: ArgType.String,
    execute(ctx) {
        const event = ctx instanceof TimerContext ? ctx.event : null
        return this.success(event?.failReason)
    },
})
