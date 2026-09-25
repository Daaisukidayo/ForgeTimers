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
        forgescript_1.Arg.requiredEnum(__1.TimerKind, "kind", "The kind of the timer to look for"),
        forgescript_1.Arg.requiredString("name", "The name of the timer to get"),
        forgescript_1.Arg.optionalEnum(timer_1.TimerProperty, "property", "The property of the timer to return")
    ],
    output: [
        forgescript_1.ArgType.Json,
        forgescript_1.ArgType.Unknown
    ],
    async execute(ctx, [kind, name, prop]) {
        if (!(await __1.ForgeTimers.of(ctx.client).ready))
            return this.success();
        const timer = await __1.Database.get(kind, name);
        if (!timer)
            return this.success();
        if (prop)
            return (0, timer_1.answer)(this, timer, prop);
        return this.successJSON((0, timer_1.readProperties)(timer));
    }
});
//# sourceMappingURL=getTimer.js.map