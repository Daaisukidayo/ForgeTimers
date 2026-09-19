import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers, TimerKind } from "../.."
import { readProperties, TimerProperties, TimerProperty } from "../../properties/timer"

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
        },
        {
            name: "property",
            description: "Return only this property of every timer, instead of all of them",
            rest: false,
            type: ArgType.Enum,
            enum: TimerProperty
        },
        {
            name: "separator",
            description: "Join the properties with this, instead of listing them as JSON",
            rest: false,
            type: ArgType.String
        }
    ],
    output: [
        ArgType.Json,
        ArgType.Unknown
    ],
    async execute(ctx, [kind, prop, sep]) {
        if (!(await ctx.client.getExtension(ForgeTimers, true).ready)) return this.successJSON([])

        const timers = kind ? await Database.getAllOf(kind) : await Database.getAll()
        if (!prop) return this.successJSON(timers.map(readProperties))

        const values = timers.map((timer) => TimerProperties[prop](timer))
        if (!sep) return this.successJSON(values)

        // args and config would read as [object Object] once joined
        const flat = values.map((value) => (typeof value === "object" && value !== null ? JSON.stringify(value) : value))
        return this.success(flat.join(sep))
    }
})