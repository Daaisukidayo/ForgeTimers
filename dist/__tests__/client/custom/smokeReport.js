"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const smoke_1 = require("../smoke");
exports.default = new forgescript_1.NativeFunction({
    name: "$smokeReport",
    description: "records that a smoke timer reached this point, for the live restart check",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "label",
            description: "which timer ran",
            required: true,
            rest: false,
            type: forgescript_1.ArgType.String,
        },
    ],
    execute(ctx, [label]) {
        (0, smoke_1.report)(label);
        return this.success();
    },
});
//# sourceMappingURL=smokeReport.js.map