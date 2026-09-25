"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const structures_1 = require("../../structures");
const schedule_1 = require("../../functions/schedule");
const overrides_1 = require("../../functions/overrides");
const scheduling_1 = require("../../functions/scheduling");
exports.default = new forgescript_1.NativeFunction({
    name: "$setTimeout",
    version: "1.0.0",
    description: "Executes code after given duration",
    unwrap: false,
    brackets: true,
    args: [
        forgescript_1.Arg.requiredString("code", "The code to execute"),
        forgescript_1.Arg.optionalTime("time", "How long to wait for before running this code"),
        forgescript_1.Arg.optionalString("name", "The name for this timeout"),
        forgescript_1.Arg.optionalBoolean("persist", "Whether this timeout is re-armed on startup, overriding timeoutConfig"),
        forgescript_1.Arg.optionalTime("maxOverdue", "How late this timeout may be on startup before it is discarded, overriding timeoutConfig"),
    ],
    async execute(ctx) {
        const code = this.data.fields[0];
        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4);
        if (!this["isValidReturnType"](rt))
            return rt;
        const [time, name, persist, maxOverdue] = args;
        const invalid = (0, scheduling_1.schedulingError)(code, __1.TimerKind.timeout, name, { maxOverdue });
        if (invalid)
            return this.customError(invalid);
        const duration = time || 0;
        const { runtime, run, carries } = (0, structures_1.snapshotRunner)(ctx, (tick) => this["resolveCode"](tick, code).catch(ctx.noop));
        if (!name) {
            (0, schedule_1.setLongTimeout)(duration, run);
            return this.success();
        }
        const timer = new __1.Timer({
            ...(0, scheduling_1.originOf)(ctx),
            name,
            kind: __1.TimerKind.timeout,
            code: code.rawValue,
            duration,
            config: (0, overrides_1.overridesOf)({ persist, maxOverdue }),
            vars: (0, structures_1.snapshotVars)(runtime, this.fn.name),
        });
        carries(timer);
        await __1.ForgeTimers.of(ctx.client).timersManager.start(timer, run);
        return this.success();
    },
});
//# sourceMappingURL=setTimeout.js.map