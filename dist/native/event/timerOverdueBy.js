"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const structures_1 = require("../../structures");
exports.default = new forgescript_1.NativeFunction({
    name: "$timerOverdueBy",
    version: "2.0.0",
    description: "Returns how late a restored or dropped timer was, in ms",
    unwrap: true,
    output: forgescript_1.ArgType.Number,
    execute(ctx) {
        const event = ctx instanceof structures_1.TimerContext ? ctx.event : null;
        return this.success(event?.overdueBy);
    },
});
//# sourceMappingURL=timerOverdueBy.js.map