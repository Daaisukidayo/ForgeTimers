"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const timersStore_1 = require("../../timersStore");
exports.default = new forgescript_1.NativeFunction({
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
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [name]) {
        const timeout = ctx.client.timeouts.get(name);
        clearTimeout(timeout);
        ctx.client.timeouts.delete(name);
        const store = ctx.client.get("timersStores")?.get(timersStore_1.TimerKind.Timeout);
        if (store)
            await store.delete(name);
        return this.success(!!timeout);
    },
});
//# sourceMappingURL=clearTimeout.js.map