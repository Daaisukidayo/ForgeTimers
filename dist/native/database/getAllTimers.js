"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
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
        return this.successJSON(kind ? await __1.Database.getAllOf(kind) : await __1.Database.getAll());
    }
});
//# sourceMappingURL=getAllTimers.js.map