"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$executeTimer",
    version: "2.0.0",
    description: "Runs a stored timer's code now without touching the timer itself, returns bool",
    aliases: ["$runTimer"],
    unwrap: true,
    brackets: true,
    args: [
        forgescript_1.Arg.requiredEnum(__1.TimerKind, "kind", "The kind of the timer to run"),
        forgescript_1.Arg.requiredString("name", "The name of the timer to run"),
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = __1.ForgeTimers.of(ctx.client).timersManager;
        return this.success(await manager.execute(kind, name));
    },
});
//# sourceMappingURL=executeTimer.js.map