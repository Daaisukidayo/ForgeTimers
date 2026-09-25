"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const timer_1 = require("../../properties/timer");
exports.default = new forgescript_1.NativeFunction({
    name: "$oldTimer",
    version: "2.0.0",
    description: "Retrieves a timer as it was before the event changed it",
    unwrap: true,
    brackets: true,
    args: [forgescript_1.Arg.requiredEnum(timer_1.TimerProperty, "property", "The property to pull")],
    output: [forgescript_1.ArgType.Json, forgescript_1.ArgType.Unknown],
    execute(ctx, [property]) {
        const old = ctx.states?.timer?.old;
        if (!old)
            return this.success();
        return (0, timer_1.answer)(this, old, property);
    },
});
//# sourceMappingURL=oldTimer.js.map