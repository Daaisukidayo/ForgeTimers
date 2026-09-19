import { ArgType, IExtendedCompiledFunctionField, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, Timer, TimerKind } from "../.."
import { repeatingRunner, snapshotVars } from "../../functions/snapshotVars"
import { cronError } from "../../functions/cron"
import { overridesOf } from "../../functions/overrides"

export default new NativeFunction({
    name: "$setCron",
    version: "2.0.0",
    description: "Executes code on a cron expression",
    aliases: ["$addCron", "$cron"],
    unwrap: false,
    brackets: true,
    args: [
        {
            name: "code",
            description: "The code to execute",
            rest: false,
            required: true,
            type: ArgType.String,
        },
        {
            name: "expression",
            description: "The cron expression to run it on, such as 0 9 * * 1-5",
            rest: false,
            required: true,
            type: ArgType.String,
        },
        {
            name: "name",
            description: "The name for this cron",
            rest: false,
            required: true,
            type: ArgType.String,
        },
        {
            name: "timezone",
            description: "The zone to read the expression in, such as Europe/London",
            rest: false,
            type: ArgType.String,
        },
        {
            name: "persist",
            description: "Whether this cron is re-armed on startup, overriding cronConfig",
            rest: false,
            type: ArgType.Boolean,
        },
        {
            name: "maxOverdue",
            description: "How stale a missed occurrence may be on startup before it is skipped",
            rest: false,
            type: ArgType.Time,
        },
        {
            name: "restoredTicksLimit",
            description: "How many occurrences missed while down to replay on startup, overriding cronConfig",
            rest: false,
            type: ArgType.Number,
        },
    ],
    async execute(ctx) {
        const code = this.data.fields![0] as IExtendedCompiledFunctionField

        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4, 5, 6)
        if (!this["isValidReturnType"](rt)) return rt
        const [expression, name, timezone, persist, maxOverdue, restoredTicksLimit] = args

        if (typeof code.rawValue !== "string") {
            return this.customError("@tryforge/forgescript v2.7.0 or newer is required.")
        }

        const zone = timezone || ctx.timezone

        const invalidCron = cronError(expression, zone)
        if (invalidCron) return this.customError(`"${expression}" is not a cron expression: ${invalidCron}`)

        if (maxOverdue !== undefined && maxOverdue < 0) {
            return this.customError("maxOverdue cannot be negative. Leave it out for no limit at all.")
        }

        if (restoredTicksLimit !== undefined && restoredTicksLimit < 0) {
            return this.customError(
                "restoredTicksLimit cannot be negative. Use 0 to replay nothing, or Infinity to replay every missed occurrence."
            )
        }

        const maxNameLength = Timer.maxNameLength(TimerKind.cron)
        if (name.length > maxNameLength) {
            return this.customError(`A cron name may be at most ${maxNameLength} characters long, got ${name.length}.`)
        }

        const { runtime, run } = repeatingRunner(ctx, (tick) => this["resolveCode"](tick, code).catch(ctx.noop))

        const timer = new Timer({
            name,
            kind: TimerKind.cron,
            code: code.rawValue,
            path: ctx.cmd?.data.path ?? null,
            commandName: ctx.cmd?.data.name ?? null,
            cron: expression,
            timezone: zone,
            guildID: ctx.guild?.id ?? null,
            channelID: ctx.channel?.id ?? null,
            hostID: ctx.user?.id ?? null,
            messageID: ctx.message?.id ?? null,
            args: ctx.args.length ? [...ctx.args] : undefined,
            config: overridesOf({ persist, maxOverdue, restoredTicksLimit }),
            vars: snapshotVars(runtime, this.fn.name),
        })

        await ctx.client.getExtension(ForgeTimers, true).timersManager.start(timer, run)

        return this.success()
    },
})
