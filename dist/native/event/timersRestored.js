"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const structures_1 = require("../../structures");
exports.default = new forgescript_1.NativeFunction({
    name: "$timersRestored",
    version: "2.0.0",
    description: "Returns how many stored timers the timersReady event picked back up",
    unwrap: true,
    output: forgescript_1.ArgType.Number,
    execute(ctx) {
        const event = ctx instanceof structures_1.TimerContext ? ctx.event : null;
        return this.success(event?.restored);
    },
});
//# sourceMappingURL=timersRestored.js.map