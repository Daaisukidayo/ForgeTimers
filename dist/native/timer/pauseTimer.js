"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$pauseTimer",
    version: "2.0.0",
    description: "Puts a stored timer on pause, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "kind",
            description: "The kind of the timer to pause",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.Enum,
            enum: __1.TimerKind,
        },
        {
            name: "name",
            description: "The name of the timer to pause",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [kind, name]) {
        const manager = ctx.client.getExtension(__1.ForgeTimers, true).timersManager;
        return this.success(await manager.pause(kind, name));
    },
});
//# sourceMappingURL=pauseTimer.js.map