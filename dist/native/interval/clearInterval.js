"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const timersStore_1 = require("../../timersStore");
exports.default = new forgescript_1.NativeFunction({
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
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [name]) {
        const interval = ctx.client.intervals.get(name);
        clearInterval(interval);
        ctx.client.intervals.delete(name);
        const store = ctx.client.get("timersStores")?.get(timersStore_1.TimerKind.Interval);
        if (store)
            await store.delete(name);
        return this.success(!!interval);
    },
});
//# sourceMappingURL=clearInterval.js.map