"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$timersCount",
    version: "2.0.0",
    description: "How many timers are stored, of one kind or of every kind, returns a number",
    unwrap: true,
    brackets: false,
    args: [
        forgescript_1.Arg.optionalEnum(__1.TimerKind, "kind", "Only count timers of this kind"),
    ],
    output: forgescript_1.ArgType.Number,
    async execute(ctx, [kind]) {
        if (!(await __1.ForgeTimers.of(ctx.client).ready))
            return this.success(0);
        const timers = kind ? await __1.Database.getAllOf(kind) : await __1.Database.getAll();
        return this.success(timers.length);
    },
});
//# sourceMappingURL=timersCount.js.map