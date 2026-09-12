import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers, TimerKind } from "../.."
import { readProperties } from "../../properties/timer"

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
        if (!(await ctx.client.getExtension(ForgeTimers, true).ready)) return this.successJSON([])

        const timers = kind ? await Database.getAllOf(kind) : await Database.getAll()
        return this.successJSON(timers.map(readProperties))
    }
})