import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$timersCount",
    version: "2.0.0",
    description: "How many timers are stored, of one kind or of every kind, returns a number",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "kind",
            description: "Only count timers of this kind",
            rest: false,
            type: ArgType.Enum,
            enum: TimerKind,
        },
    ],
    output: ArgType.Number,
    async execute(ctx, [kind]) {
        if (!(await ctx.client.getExtension(ForgeTimers, true).ready)) return this.success(0)

        const timers = kind ? await Database.getAllOf(kind) : await Database.getAll()
        return this.success(timers.length)
    },
})
