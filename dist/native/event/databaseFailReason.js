"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const structures_1 = require("../../structures");
exports.default = new forgescript_1.NativeFunction({
    name: "$databaseFailReason",
    version: "2.0.0",
    description: "Returns why the databaseFail event's storage could not be opened",
    unwrap: true,
    output: forgescript_1.ArgType.String,
    execute(ctx) {
        const event = ctx instanceof structures_1.TimerContext ? ctx.event : null;
        return this.success(event?.failReason);
    },
});
//# sourceMappingURL=databaseFailReason.js.map