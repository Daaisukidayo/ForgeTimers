"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const timer_1 = require("../../properties/timer");
exports.default = new forgescript_1.NativeFunction({
    name: "$findTimer",
    version: "2.0.0",
    description: "Returns every stored timer whose properties all match, as JSON",
    aliases: ["$findTimers"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "filters",
            description: "property;value pairs, all of which have to match",
            rest: true,
            required: true,
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Json,
    async execute(ctx, [filters]) {
        if (!(await ctx.client.getExtension(__1.ForgeTimers, true).ready))
            return this.successJSON([]);
        const read = (0, timer_1.readFilters)(filters);
        if (!read.ok)
            return this.customError(read.reason);
        const timers = await __1.Database.getAll();
        const found = timers.filter((timer) => (0, timer_1.matches)(timer, read.pairs));
        return this.successJSON(found.map(timer_1.readProperties));
    },
});
//# sourceMappingURL=findTimer.js.map