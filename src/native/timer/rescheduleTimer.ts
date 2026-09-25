import { Arg, ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, TimerKind } from "../.."
import { cronError } from "../../functions/cron"

export default new NativeFunction({
    name: "$rescheduleTimer",
    version: "2.0.0",
    description: "Moves a stored timer's schedule without scheduling it from scratch, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        Arg.requiredEnum(TimerKind, "kind", "The kind of the timer to move, which is what the schedule below means"),
        Arg.requiredString("name", "The name of the timer to move"),
        Arg.requiredString(
            "schedule",
            "A delay for a timeout, a tick length for an interval, an expression for a cron"
        ),
        Arg.optionalString("timezone", "The zone to read a cron's new expression in. Left out keeps the one it had"),
    ],
    output: ArgType.Boolean,
    async execute(ctx, [kind, name, schedule, timezone]) {
        const manager = ForgeTimers.of(ctx.client).timersManager

        if (kind === TimerKind.cron) {
            const invalid = cronError(schedule, timezone || null)
            if (invalid) return this.customError(`"${schedule}" is not a cron expression: ${invalid}`)

            return this.success(await manager.rescheduleCron(name, schedule, timezone || null))
        }

        const duration = this["resolveTime"](ctx, this.fn.data.args![2], schedule, [])

        if (duration === undefined) {
            return this.customError(`"${schedule}" is not a duration a ${kind} can wait.`)
        }

        return this.success(await manager.reschedule(kind, name, duration))
    },
})
