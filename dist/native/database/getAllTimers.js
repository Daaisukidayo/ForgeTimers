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
        {
            name: "kind",
            description: "Only return timers of this kind",
            rest: false,
            type: forgescript_1.ArgType.Enum,
            enum: __1.TimerKind
        },
        {
            name: "property",
            description: "Return only this property of every timer, instead of all of them",
            rest: false,
            type: forgescript_1.ArgType.Enum,
            enum: timer_1.TimerProperty
        },
        {
            name: "separator",
            description: "Join the properties with this, instead of listing them as JSON",
            rest: false,
            type: forgescript_1.ArgType.String
        }
    ],
    output: [
        forgescript_1.ArgType.Json,
        forgescript_1.ArgType.Unknown
    ],
    async execute(ctx, [kind, prop, sep]) {
        if (!(await ctx.client.getExtension(__1.ForgeTimers, true).ready))
            return this.successJSON([]);
        const timers = kind ? await __1.Database.getAllOf(kind) : await __1.Database.getAll();
        if (!prop)
            return this.successJSON(timers.map(timer_1.readProperties));
        const values = timers.map((timer) => timer_1.TimerProperties[prop](timer));
        if (!sep)
            return this.successJSON(values);
        // args and config would read as [object Object] once joined
        const flat = values.map((value) => (typeof value === "object" && value !== null ? JSON.stringify(value) : value));
        return this.success(flat.join(sep));
    }
});
//# sourceMappingURL=getAllTimers.js.map