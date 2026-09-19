import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers, Timer } from "../.."
import { readProperties, TimerProperties, TimerProperty } from "../../properties/timer"

function textOf(timer: Timer, property: TimerProperty) {
    const value = TimerProperties[property](timer)

    if (value === null || value === undefined) return ""
    return typeof value === "object" ? JSON.stringify(value) : String(value)
}

export default new NativeFunction({
    name: "$findTimer",
    version: "2.0.0",
    description: "Returns every stored timer whose properties all match, as JSON",
    aliases: ["$findTimers"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "filters",
            description: "property;value pairs, all of which have to match",
            rest: true,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Json,
    async execute(ctx, [filters]) {
        if (!(await ctx.client.getExtension(ForgeTimers, true).ready)) return this.successJSON([])

        if (filters.length % 2) {
            return this.customError(
                `Every filter needs a property and a value, and "${filters.at(-1)}" was left without one.`
            )
        }

        const pairs: Array<[TimerProperty, string]> = []

        for (let i = 0; i < filters.length; i += 2) {
            const named = filters[i] as TimerProperty

            if (!(named in TimerProperties)) {
                return this.customError(
                    `"${named}" is not a timer property.`
                )
            }

            pairs.push([named, filters[i + 1]])
        }

        const timers = await Database.getAll()
        const found = timers.filter((timer) => pairs.every(([named, wanted]) => textOf(timer, named) === wanted))

        return this.successJSON(found.map(readProperties))
    },
})
