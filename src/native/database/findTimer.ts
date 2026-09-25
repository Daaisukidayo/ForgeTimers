import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers } from "../.."
import { matches, readFilters, readProperties } from "../../properties/timer"

export default new NativeFunction({
    name: "$findTimer",
    version: "2.0.0",
    description: "Returns every stored timer whose properties all match, as JSON",
    aliases: ["$findTimers"],
    unwrap: true,
    brackets: true,
    args: [
        Arg.restString("filters", "property;value pairs, all of which have to match", true),
    ],
    output: ArgType.Json,
    async execute(ctx, [filters]) {
        if (!(await ForgeTimers.of(ctx.client).ready)) return this.successJSON([])

        const read = readFilters(filters)
        if (!read.ok) return this.customError(read.reason)

        const timers = await Database.getAll()
        const found = timers.filter((timer) => matches(timer, read.pairs))

        return this.successJSON(found.map(readProperties))
    },
})
