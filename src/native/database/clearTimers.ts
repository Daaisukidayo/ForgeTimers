import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers } from "../.."
import { matches, readFilters } from "../../properties/timer"

export default new NativeFunction({
    name: "$clearTimers",
    version: "2.0.0",
    description: "Cancels and forgets every stored timer whose properties all match, returns how many",
    aliases: ["$stopTimers", "$deleteTimers"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "filters",
            description: "Property and value pairs, all of which have to match",
            rest: true,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Number,
    async execute(ctx, [filters]) {
        const extension = ctx.client.getExtension(ForgeTimers, true)
        if (!(await extension.ready)) return this.success(0)

        const read = readFilters(filters)
        if (!read.ok) return this.customError(read.reason)

        const doomed = (await Database.getAll()).filter((timer) => matches(timer, read.pairs))

        let cleared = 0
        for (const timer of doomed) {
            const result = await extension.timersManager.stop(timer.kind, timer.name)
            if (result.cleared || result.forgotten) cleared++
        }

        return this.success(cleared)
    },
})
