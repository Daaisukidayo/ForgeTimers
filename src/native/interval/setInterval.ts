import { ArgType, IExtendedCompiledFunctionField, NativeFunction, Logger } from "@tryforge/forgescript"
import { IPersistedTimer, TimersStores, TimerKind } from "../../timersStore"
import { snapshotVars } from "../../varsSnapshot"

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

        const every = time || 0

        const store = ctx.client.get<TimersStores>("timersStores")?.get(TimerKind.Interval)
        let record: IPersistedTimer | undefined
 
        if (name) {
            const previous = ctx.client.intervals.get(name)
            if (previous) {
                clearInterval(previous)
                Logger.warn(`${this.fn.name} | Replacing existing interval "${name}"`)
            }
 
            if (store && every > 0) {
                record = {
                    id: name,
                    kind: TimerKind.Interval,
                    code: code.rawValue,
                    path: ctx.cmd?.data.path ?? null,
                    fireAt: Date.now() + every,
                    interval: every,
                    guildId: ctx.guild?.id ?? null,
                    channelId: ctx.channel!.id,
                    userId: ctx.user?.id ?? null,
                    messageId: ctx.message?.id ?? null,
                    vars: snapshotVars(ctx.cloneRuntime(), this.fn.name),
                }
                await store.save(record).catch((err) => Logger.error(err))
            }
        }
 
        const c = ctx.clone(ctx.cloneRuntime())
        const timer = setInterval(async () => {
            await this["resolveCode"](c, code).catch(ctx.noop)
            if (record && store) {
                await store.save({ ...record, fireAt: Date.now() + every }).catch((err) => Logger.error(err))
            }
        }, every || undefined)
 
        if (name) ctx.client.intervals.set(name, timer)
 
        return this.success()
    },
})