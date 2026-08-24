import { ArgType, IExtendedCompiledFunctionField, NativeFunction, Logger } from "@tryforge/forgescript"
import { IPersistedTimer, TimersStores, TimerKind } from "../../timersStore"
import { snapshotVars } from "../../varsSnapshot"

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

        const delay = time || 0

        const store = ctx.client.get<TimersStores>("timersStores")?.get(TimerKind.Timeout)
        if (name) {
            const previous = ctx.client.timeouts.get(name)
            if (previous) {
                clearTimeout(previous)
                Logger.warn(`${this.fn.name} | Replacing existing timeout "${name}"`)
            }

            if (store) {
                const record: IPersistedTimer = {
                    id: name,
                    kind: TimerKind.Timeout,
                    code: code.rawValue,
                    path: ctx.cmd?.data.path ?? null,
                    fireAt: Date.now() + delay,
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
        const timer = setTimeout(async () => {
            await this["resolveCode"](c, code).catch(ctx.noop)
            
            if (name) {
                ctx.client.timeouts.delete(name)
                await store?.delete(name).catch((err) => Logger.error(err))
            }
        }, delay || undefined)
 
        if (name) ctx.client.timeouts.set(name, timer)
 
        return this.success()
    },
})