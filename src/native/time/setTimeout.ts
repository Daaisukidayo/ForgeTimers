import { ArgType, IExtendedCompiledFunctionField, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, Timer, TimerKind } from "../.."
import { snapshotVars } from "../../functions/snapshotVars"
import { setLongTimeout } from "../../functions/schedule"

export default new NativeFunction({
    name: "$setTimeout",
    version: "1.0.0",
    description: "Executes code after given duration",
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
            description: "The name for this timeout",
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
                "This build of @tryforge/forgescript does not expose a field's raw code, which ForgeTimers needs to persist a timeout. Version 2.7.0 or newer is required."
            )
        }

        const duration = time || 0
        if (duration < 0) {
            return this.customError("A timeout cannot be scheduled with a negative duration.")
        }

        const runtime = ctx.cloneRuntime()
        const runner = ctx.clone(runtime)
        const run = async () => void (await this["resolveCode"](runner, code).catch(ctx.noop))

        if (!name) {
            setLongTimeout(duration, run)
            return this.success()
        }

        const maxNameLength = Timer.maxNameLength(TimerKind.timeout)
        if (name.length > maxNameLength) {
            return this.customError(
                `A timeout name may be at most ${maxNameLength} characters long, got ${name.length}.`
            )
        }

        const timer = new Timer({
            name,
            kind: TimerKind.timeout,
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