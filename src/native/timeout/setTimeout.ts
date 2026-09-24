import { Arg, IExtendedCompiledFunctionField, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, Timer, TimerKind } from "../.."
import { snapshotRunner, snapshotVars } from "../../structures"
import { setLongTimeout } from "../../functions/schedule"
import { overridesOf } from "../../functions/overrides"
import { originOf, schedulingError } from "../../functions/scheduling"

export default new NativeFunction({
    name: "$setTimeout",
    version: "1.0.0",
    description: "Executes code after given duration",
    unwrap: false,
    brackets: true,
    args: [
        Arg.requiredString("code", "The code to execute"),
        Arg.optionalTime("time", "How long to wait for before running this code"),
        Arg.optionalString("name", "The name for this timeout"),
        Arg.optionalBoolean("persist", "Whether this timeout is re-armed on startup, overriding timeoutConfig"),
        Arg.optionalTime(
            "maxOverdue",
            "How late this timeout may be on startup before it is discarded, overriding timeoutConfig"
        ),
    ],
    async execute(ctx) {
        const code = this.data.fields![0] as IExtendedCompiledFunctionField

        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4)
        if (!this["isValidReturnType"](rt)) return rt
        const [time, name, persist, maxOverdue] = args

        const invalid = schedulingError(code, TimerKind.timeout, name, { maxOverdue })
        if (invalid) return this.customError(invalid)

        const duration = time || 0
        const { runtime, run, carries } = snapshotRunner(ctx, (tick) => this["resolveCode"](tick, code).catch(ctx.noop))

        if (!name) {
            setLongTimeout(duration, run)
            return this.success()
        }

        const timer = new Timer({
            ...originOf(ctx),
            name,
            kind: TimerKind.timeout,
            code: code.rawValue!,
            duration,
            config: overridesOf({ persist, maxOverdue }),
            vars: snapshotVars(runtime, this.fn.name),
        })

        carries(timer)
        await ForgeTimers.of(ctx.client).timersManager.start(timer, run)

        return this.success()
    },
})
