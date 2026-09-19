"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const timer_1 = require("../../properties/timer");
function textOf(timer, property) {
    const value = timer_1.TimerProperties[property](timer);
    if (value === null || value === undefined)
        return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}
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
        if (filters.length % 2) {
            return this.customError(`Every filter needs a property and a value, and "${filters.at(-1)}" was left without one.`);
        }
        const pairs = [];
        for (let i = 0; i < filters.length; i += 2) {
            const named = filters[i];
            if (!(named in timer_1.TimerProperties)) {
                return this.customError(`"${named}" is not a timer property.`);
            }
            pairs.push([named, filters[i + 1]]);
        }
        const timers = await __1.Database.getAll();
        const found = timers.filter((timer) => pairs.every(([named, wanted]) => textOf(timer, named) === wanted));
        return this.successJSON(found.map(timer_1.readProperties));
    },
});
//# sourceMappingURL=findTimer.js.map