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
        }
    ],
    output: forgescript_1.ArgType.Json,
    async execute(ctx, [kind]) {
        if (!(await ctx.client.getExtension(__1.ForgeTimers, true).ready))
            return this.successJSON([]);
        const timers = kind ? await __1.Database.getAllOf(kind) : await __1.Database.getAll();
        return this.successJSON(timers.map(timer_1.readProperties));
    }
});
//# sourceMappingURL=getAllTimers.js.map