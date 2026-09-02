"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const timer_1 = require("../../properties/timer");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$getTimer",
    version: "1.1.0",
    description: "Gets an existing timer from the database",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "kind",
            description: "Whether to look for a timeout or an interval",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.Enum,
            enum: __1.TimerKind
        },
        {
            name: "name",
            description: "The name of the timer to get",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "property",
            description: "The property of the timer to return",
            rest: false,
            type: forgescript_1.ArgType.Enum,
            enum: timer_1.TimerProperty
        }
    ],
    output: [
        forgescript_1.ArgType.Json,
        forgescript_1.ArgType.Unknown
    ],
    async execute(ctx, [kind, name, prop]) {
        const timer = await __1.Database.get(kind, name);
        if (!timer)
            return this.success();
        if (prop) {
            const value = timer_1.TimerProperties[prop](timer);
            return typeof value === "object" && value !== null
                ? this.successJSON(value)
                : this.success(value);
        }
        return this.successJSON(timer);
    }
});
//# sourceMappingURL=getTimer.js.map