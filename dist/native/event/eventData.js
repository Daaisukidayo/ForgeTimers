"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const event_1 = require("../../properties/event");
const structures_1 = require("../../structures");
exports.default = new forgescript_1.NativeFunction({
    name: "$eventData",
    version: "2.0.0",
    description: "Returns what an event carries besides its timer",
    unwrap: true,
    brackets: false,
    args: [forgescript_1.Arg.optionalEnum(event_1.TimerEventProperty, "property", "The property to return, or every one of them as JSON")],
    output: [forgescript_1.ArgType.Json, forgescript_1.ArgType.Unknown],
    execute(ctx, [property]) {
        const event = ctx instanceof structures_1.TimerContext ? ctx.event : null;
        if (!event)
            return this.success();
        if (!property)
            return this.successJSON(event);
        return this.success(event[property]);
    },
});
//# sourceMappingURL=eventData.js.map