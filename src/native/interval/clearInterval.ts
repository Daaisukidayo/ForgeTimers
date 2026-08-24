import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimersStores, TimerKind } from "../../timersStore"

export default new NativeFunction({
    name: "$clearInterval",
    version: "1.0.0",
    description: "Clears an active interval, returns bool",
    aliases: ["$stopInterval"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "name",
            description: "The name of the interval",
            rest: false,
            required: true,
            type: ArgType.String,
        },
    ],
    output: ArgType.Boolean,
    async execute(ctx, [name]) {
        const interval = ctx.client.intervals.get(name)
        clearInterval(interval)
        ctx.client.intervals.delete(name)

        const store = ctx.client.get<TimersStores>("timersStores")?.get(TimerKind.Interval)
        if (store) await store.delete(name)

        return this.success(!!interval)
    },
})