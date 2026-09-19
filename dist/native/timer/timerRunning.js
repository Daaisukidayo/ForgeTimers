"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$timerRunning",
    version: "2.0.0",
    description: "Checks whether a timer is running right now, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "kind",
            description: "The kind of the timer to look for",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.Enum,
            enum: __1.TimerKind,
        },
        {
            name: "name",
            description: "The name of the timer to look for",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    execute(ctx, [kind, name]) {
        const manager = ctx.client.getExtension(__1.ForgeTimers, true).timersManager;
        return this.success(manager.isLive(kind, name));
    },
});
//# sourceMappingURL=timerRunning.js.map