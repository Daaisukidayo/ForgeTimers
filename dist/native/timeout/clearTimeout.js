"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$clearTimeout",
    version: "1.0.0",
    description: "Clears an active timeout, returns bool",
    aliases: ["$stopTimeout", "$deleteTimeout"],
    unwrap: true,
    brackets: true,
    args: [forgescript_1.Arg.requiredString("name", "The name of the timeout")],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [name]) {
        const manager = __1.ForgeTimers.of(ctx.client).timersManager;
        const { cleared, forgotten } = await manager.stop(__1.TimerKind.timeout, name);
        return this.success(cleared || forgotten);
    },
});
//# sourceMappingURL=clearTimeout.js.map