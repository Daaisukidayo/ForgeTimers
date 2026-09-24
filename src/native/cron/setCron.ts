import { Arg, IExtendedCompiledFunctionField, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, Timer, TimerKind } from "../.."
import { snapshotRunner, snapshotVars } from "../../structures"
import { cronError } from "../../functions/cron"
import { overridesOf } from "../../functions/overrides"
import { originOf, schedulingError } from "../../functions/scheduling"

export default new NativeFunction({
    name: "$setCron",
    version: "2.0.0",
    description: "Executes code on a cron expression",
    aliases: ["$addCron", "$cron"],
    unwrap: false,
    brackets: true,
    args: [
        Arg.requiredString("code", "The code to execute"),
        Arg.requiredString("expression", "The cron expression to run it on, such as 0 9 * * 1-5"),
        Arg.requiredString("name", "The name for this cron"),
        Arg.optionalString("timezone", "The zone to read the expression in, such as Europe/London"),
        Arg.optionalBoolean("persist", "Whether this cron is re-armed on startup, overriding cronConfig"),
        Arg.optionalTime("maxOverdue", "How stale a missed occurrence may be on startup before it is skipped"),
        Arg.optionalNumber(
            "restoredTicksLimit",
            "How many occurrences missed while down to replay on startup, overriding cronConfig"
        ),
    ],
    async execute(ctx) {
        const code = this.data.fields![0] as IExtendedCompiledFunctionField

        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4, 5, 6)
        if (!this["isValidReturnType"](rt)) return rt
        const [expression, name, timezone, persist, maxOverdue, restoredTicksLimit] = args

        const invalid = schedulingError(code, TimerKind.cron, name, { maxOverdue, restoredTicksLimit })
        if (invalid) return this.customError(invalid)

        const zone = timezone || ctx.timezone

        const invalidCron = cronError(expression, zone)
        if (invalidCron) return this.customError(`"${expression}" is not a cron expression: ${invalidCron}`)

        const { runtime, run, carries } = snapshotRunner(ctx, (tick) => this["resolveCode"](tick, code).catch(ctx.noop))

        const timer = new Timer({
            ...originOf(ctx),
            name,
            kind: TimerKind.cron,
            code: code.rawValue!,
            cron: expression,
            timezone: zone,
            config: overridesOf({ persist, maxOverdue, restoredTicksLimit }),
            vars: snapshotVars(runtime, this.fn.name),
        })

        carries(timer)
        await ForgeTimers.of(ctx.client).timersManager.start(timer, run)

        return this.success()
    },
})
