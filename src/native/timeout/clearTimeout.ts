import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimersStores, TimerKind } from "../../timersStore"

export default new NativeFunction({
    name: "$clearTimeout",
    version: "1.0.0",
    description: "Clears an active timeout, returns bool",
    aliases: ["$stopTimeout"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "name",
            description: "The name of the timeout",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Boolean,
    async execute(ctx, [name]) {
        const timeout = ctx.client.timeouts.get(name)
        clearTimeout(timeout)
        ctx.client.timeouts.delete(name)

        const store = ctx.client.get<TimersStores>("timersStores")?.get(TimerKind.Timeout)
        if (store) await store.delete(name)

        return this.success(!!timeout)
    },
})