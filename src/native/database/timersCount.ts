import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { Database, ForgeTimers, TimerKind } from "../.."

export default new NativeFunction({
    name: "$timersCount",
    version: "2.0.0",
    description: "How many timers are stored, of one kind or of every kind, returns a number",
    unwrap: true,
    brackets: false,
    args: [
        Arg.optionalEnum(TimerKind, "kind", "Only count timers of this kind"),
    ],
    output: ArgType.Number,
    async execute(ctx, [kind]) {
        if (!(await ForgeTimers.of(ctx.client).ready)) return this.success(0)

        const timers = kind ? await Database.getAllOf(kind) : await Database.getAll()
        return this.success(timers.length)
    },
})
