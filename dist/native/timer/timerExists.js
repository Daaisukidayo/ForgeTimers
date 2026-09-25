"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$timerExists",
    version: "2.0.0",
    description: "Checks whether a timer is stored under this name, running or not, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        forgescript_1.Arg.requiredEnum(__1.TimerKind, "kind", "The kind of the timer to look for"),
        forgescript_1.Arg.requiredString("name", "The name of the timer to look for"),
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = __1.ForgeTimers.of(ctx.client).timersManager;
        return this.success(await manager.exists(kind, name));
    },
});
//# sourceMappingURL=timerExists.js.map