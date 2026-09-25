import { Arg, IExtendedCompiledFunctionField, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, Timer, TimerKind } from "../.."
import { snapshotRunner, snapshotVars } from "../../structures"
import { setLongInterval } from "../../functions/schedule"
import { overridesOf } from "../../functions/overrides"
import { originOf, schedulingError } from "../../functions/scheduling"

export default new NativeFunction({
    name: "$setInterval",
    version: "1.0.0",
    description: "Executes code after given duration until canceled",
    unwrap: false,
    brackets: true,
    args: [
        Arg.requiredString("code", "The code to execute"),
        Arg.optionalTime("time", "How long to wait for before running this code"),
        Arg.optionalString("name", "The name for this interval"),
        Arg.optionalBoolean("persist", "Whether this interval is re-armed on startup, overriding intervalConfig"),
        Arg.optionalTime(
            "maxOverdue",
            "How stale a missed tick may be on startup before it is skipped, overriding intervalConfig"
        ),
        Arg.optionalNumber(
            "restoredTicksLimit",
            "How many ticks missed while down to replay on startup, overriding intervalConfig"
        ),
    ],
    async execute(ctx) {
        const code = this.data.fields![0] as IExtendedCompiledFunctionField

        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4, 5)
        if (!this["isValidReturnType"](rt)) return rt
        const [time, name, persist, maxOverdue, restoredTicksLimit] = args

        const invalid = schedulingError(code, TimerKind.interval, name, { maxOverdue, restoredTicksLimit })
        if (invalid) return this.customError(invalid)

        const duration = time || 0
        const { runtime, run, carries } = snapshotRunner(ctx, (tick) => this["resolveCode"](tick, code).catch(ctx.noop))

        if (!name) {
            setLongInterval(duration, run)
            return this.success()
        }

        const timer = new Timer({
            ...originOf(ctx),
            name,
            kind: TimerKind.interval,
            code: code.rawValue!,
            duration,
            config: overridesOf({ persist, maxOverdue, restoredTicksLimit }),
            vars: snapshotVars(runtime, this.fn.name),
        })

        carries(timer)
        await ForgeTimers.of(ctx.client).timersManager.start(timer, run)

        return this.success()
    },
})
