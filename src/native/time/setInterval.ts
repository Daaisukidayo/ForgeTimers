import { ArgType, IExtendedCompiledFunctionField, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers, Timer, TimerKind } from "../.."
import { snapshotVars } from "../../functions/snapshotVars"

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
            return this.customError("ForgeTimers requires @tryforge/forgescript >=2.7.0")
        }

        const duration = time || 0
        const runner = ctx.clone(ctx.cloneRuntime())
        const run = async () => void (await this["resolveCode"](runner, code).catch(ctx.noop))

        if (!name) {
            setInterval(run, duration || undefined)
            return this.success()
        }

        const timer = new Timer({
            name,
            kind: TimerKind.interval,
            code: code.rawValue,
            path: ctx.cmd?.data.path ?? null,
            duration,
            guildID: ctx.guild?.id ?? null,
            channelID: ctx.channel!.id,
            hostID: ctx.user?.id ?? null,
            messageID: ctx.message?.id ?? null,
            args: ctx.args.length ? [...ctx.args] : undefined,
            vars: snapshotVars(ctx.cloneRuntime(), this.fn.name),
        })

        await ctx.client.getExtension(ForgeTimers, true).timersManager.start(timer, run)

        return this.success()
    },
})