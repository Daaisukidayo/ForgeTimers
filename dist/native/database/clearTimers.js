"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const timer_1 = require("../../properties/timer");
exports.default = new forgescript_1.NativeFunction({
    name: "$clearTimers",
    version: "2.0.0",
    description: "Cancels and forgets every stored timer whose properties all match, returns how many",
    aliases: ["$stopTimers", "$deleteTimers"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "filters",
            description: "Property and value pairs, all of which have to match",
            rest: true,
            required: true,
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Number,
    async execute(ctx, [filters]) {
        const extension = ctx.client.getExtension(__1.ForgeTimers, true);
        if (!(await extension.ready))
            return this.success(0);
        const read = (0, timer_1.readFilters)(filters);
        if (!read.ok)
            return this.customError(read.reason);
        const doomed = (await __1.Database.getAll()).filter((timer) => (0, timer_1.matches)(timer, read.pairs));
        let cleared = 0;
        for (const timer of doomed) {
            const result = await extension.timersManager.stop(timer.kind, timer.name);
            if (result.cleared || result.forgotten)
                cleared++;
        }
        return this.success(cleared);
    },
});
//# sourceMappingURL=clearTimers.js.map