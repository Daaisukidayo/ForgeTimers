"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$clearTimer",
    version: "2.0.0",
    description: "Cancels a timer of any kind and forgets it, returns bool",
    aliases: ["$stopTimer", "$deleteTimer"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "kind",
            description: "The kind of the timer to cancel",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.Enum,
            enum: __1.TimerKind,
        },
        {
            name: "name",
            description: "The name of the timer to cancel",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ctx.client.getExtension(__1.ForgeTimers, true).timersManager;
        const { cleared, forgotten } = await manager.stop(kind, name);
        return this.success(cleared || forgotten);
    },
});
//# sourceMappingURL=clearTimer.js.map