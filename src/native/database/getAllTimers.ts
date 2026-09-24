import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers, TimerKind } from "../.."
import { isStructured, readProperties, TimerProperties, TimerProperty } from "../../properties/timer"

export default new NativeFunction({
    name: "$getAllTimers",
    version: "1.1.0",
    description: "Gets all existing timers from the database",
    unwrap: true,
    brackets: false,
    args: [
        Arg.optionalEnum(TimerKind, "kind", "Only return timers of this kind"),
        Arg.optionalEnum(TimerProperty, "property", "Return only this property of every timer, instead of all of them"),
        Arg.optionalString("separator", "Join the properties with this, instead of listing them as JSON")
    ],
    output: [
        ArgType.Json,
        ArgType.Unknown
    ],
    async execute(ctx, [kind, prop, sep]) {
        if (!(await ForgeTimers.of(ctx.client).ready)) return this.successJSON([])

        const timers = kind ? await Database.getAllOf(kind) : await Database.getAll()
        if (!prop) return this.successJSON(timers.map(readProperties))

        const values = timers.map((timer) => TimerProperties[prop](timer))
        if (!sep) return this.successJSON(values)

        // args and config would read as [object Object] once joined
        const flat = values.map((value) => (isStructured(value) ? JSON.stringify(value) : value))
        return this.success(flat.join(sep))
    }
})