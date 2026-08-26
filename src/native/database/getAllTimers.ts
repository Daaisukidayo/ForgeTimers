import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, TimerKind } from "../.."

export default new NativeFunction({
    name: "$getAllTimers",
    version: "1.1.0",
    description: "Gets all existing timers from the database",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "kind",
            description: "Only return timers of this kind",
            rest: false,
            type: ArgType.Enum,
            enum: TimerKind
        }
    ],
    output: ArgType.Json,
    async execute(ctx, [kind]) {
        return this.successJSON(kind ? await Database.getAllOf(kind) : await Database.getAll())
    }
})