import { ArgType, Context, IExtendedCompiledFunctionField, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, Timer, TimerKind } from "../.."
import { snapshotVars } from "../../functions/snapshotVars"
import { setLongInterval } from "../../functions/schedule"

export default new NativeFunction({
    name: "$setInterval",
    version: "1.0.0",
    description: "Executes code after given duration until canceled",
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
            name: "time",
            description: "How long to wait for before running this code",
            rest: false,
            type: ArgType.Time,
        },
        {
            name: "name",
            description: "The name for this interval",
            rest: false,
            type: ArgType.String,
        },
    ],
    async execute(ctx) {
        const code = this.data.fields![0] as IExtendedCompiledFunctionField

        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2)
        if (!this["isValidReturnType"](rt)) return rt
        const [time, name] = args

        if (typeof code.rawValue !== "string") {
            return this.customError(
                "This build of @tryforge/forgescript does not expose a field's raw code, which ForgeTimers needs to persist an interval. Version 2.7.0 or newer is required."
            )
        }

        const duration = time || 0
        if (duration <= 0) {
            return this.customError("An interval requires a duration greater than 0.")
        }

        const runtime = ctx.cloneRuntime()

        const vars = {
            keywords: { ...runtime.keywords },
            environment: { ...runtime.environment },
            localFunctions: { ...runtime.localFunctions },
        }

        const run = async () => {
            const tick = new Context({
                ...runtime,
                container: undefined,
                keywords: { ...vars.keywords },
                environment: { ...vars.environment },
                localFunctions: { ...vars.localFunctions },
            })

            await this["resolveCode"](tick, code).catch(ctx.noop)
        }

        if (!name) {
            setLongInterval(duration, run)
            return this.success()
        }

        const maxNameLength = Timer.maxNameLength(TimerKind.interval)
        if (name.length > maxNameLength) {
            return this.customError(
                `An interval name may be at most ${maxNameLength} characters long, got ${name.length}.`
            )
        }

        const timer = new Timer({
            name,
            kind: TimerKind.interval,
            code: code.rawValue,
            path: ctx.cmd?.data.path ?? null,
            commandName: ctx.cmd?.data.name ?? null,
            duration,
            guildID: ctx.guild?.id ?? null,
            channelID: ctx.channel?.id ?? null,
            hostID: ctx.user?.id ?? null,
            messageID: ctx.message?.id ?? null,
            args: ctx.args.length ? [...ctx.args] : undefined,
            vars: snapshotVars(runtime, this.fn.name),
        })

        await ctx.client.getExtension(ForgeTimers, true).timersManager.start(timer, run)

        return this.success()
    },
})