"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const timer_1 = require("../../properties/timer");
exports.default = new forgescript_1.NativeFunction({
    name: "$getAllTimers",
    version: "1.1.0",
    description: "Gets all existing timers from the database",
    unwrap: true,
    brackets: false,
    args: [
        forgescript_1.Arg.optionalEnum(__1.TimerKind, "kind", "Only return timers of this kind"),
        forgescript_1.Arg.optionalEnum(timer_1.TimerProperty, "property", "Return only this property of every timer, instead of all of them"),
        forgescript_1.Arg.optionalString("separator", "Join the properties with this, instead of listing them as JSON")
    ],
    output: [
        forgescript_1.ArgType.Json,
        forgescript_1.ArgType.Unknown
    ],
    async execute(ctx, [kind, prop, sep]) {
        if (!(await __1.ForgeTimers.of(ctx.client).ready))
            return this.successJSON([]);
        const timers = kind ? await __1.Database.getAllOf(kind) : await __1.Database.getAll();
        if (!prop)
            return this.successJSON(timers.map(timer_1.readProperties));
        const values = timers.map((timer) => timer_1.TimerProperties[prop](timer));
        if (!sep)
            return this.successJSON(values);
        // args and config would read as [object Object] once joined
        const flat = values.map((value) => ((0, timer_1.isStructured)(value) ? JSON.stringify(value) : value));
        return this.success(flat.join(sep));
    }
});
//# sourceMappingURL=getAllTimers.js.map