"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const timer_1 = require("../../properties/timer");
const structures_1 = require("../../structures");
exports.default = new forgescript_1.NativeFunction({
    name: "$timerData",
    version: "2.0.0",
    description: "Returns what an event's timer was scheduled with",
    unwrap: true,
    brackets: false,
    args: [
        {
            name: "property",
            description: "The property to return, or every one of them as JSON",
            rest: false,
            type: forgescript_1.ArgType.Enum,
            enum: timer_1.TimerProperty,
        },
    ],
    output: [forgescript_1.ArgType.Json, forgescript_1.ArgType.Unknown],
    execute(ctx, [prop]) {
        const timer = ctx instanceof structures_1.TimerContext ? ctx.timer : null;
        if (!timer)
            return this.success();
        if (!prop)
            return this.successJSON((0, timer_1.readProperties)(timer));
        const value = timer_1.TimerProperties[prop](timer);
        return (0, timer_1.isStructured)(value) ? this.successJSON(value) : this.success(value);
    },
});
//# sourceMappingURL=timerData.js.map