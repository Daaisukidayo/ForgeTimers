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
        forgescript_1.Arg.requiredEnum(__1.TimerKind, "kind", "The kind of the timer to cancel"),
        forgescript_1.Arg.requiredString("name", "The name of the timer to cancel"),
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = __1.ForgeTimers.of(ctx.client).timersManager;
        const { cleared, forgotten } = await manager.stop(kind, name);
        return this.success(cleared || forgotten);
    },
});
//# sourceMappingURL=clearTimer.js.map