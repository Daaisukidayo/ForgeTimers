"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const timer_1 = require("../../properties/timer");
exports.default = new forgescript_1.NativeFunction({
    name: "$newTimer",
    version: "2.0.0",
    description: "Retrieves a timer as the event left it",
    unwrap: true,
    brackets: true,
    args: [forgescript_1.Arg.requiredEnum(timer_1.TimerProperty, "property", "The property to pull")],
    output: [forgescript_1.ArgType.Json, forgescript_1.ArgType.Unknown],
    execute(ctx, [property]) {
        const fresh = ctx.states?.timer?.new;
        if (!fresh)
            return this.success();
        return (0, timer_1.answer)(this, fresh, property);
    },
});
//# sourceMappingURL=newTimer.js.map