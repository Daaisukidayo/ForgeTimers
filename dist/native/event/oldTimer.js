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
    args: [
        {
            name: "property",
            description: "The property to pull",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.Enum,
            enum: timer_1.TimerProperty,
        },
    ],
    output: forgescript_1.ArgType.Unknown,
    execute(ctx, [property]) {
        const old = ctx.states?.timer?.old;
        if (!old)
            return this.success();
        return this.success(timer_1.TimerProperties[property](old));
    },
});
//# sourceMappingURL=oldTimer.js.map