"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const cron_1 = require("../../functions/cron");
exports.default = new forgescript_1.NativeFunction({
    name: "$rescheduleTimer",
    version: "2.0.0",
    description: "Moves a stored timer's schedule without scheduling it from scratch, returns bool",
    unwrap: true,
    brackets: true,
    args: [
        forgescript_1.Arg.requiredEnum(__1.TimerKind, "kind", "The kind of the timer to move, which is what the schedule below means"),
        forgescript_1.Arg.requiredString("name", "The name of the timer to move"),
        forgescript_1.Arg.requiredString("schedule", "A delay for a timeout, a tick length for an interval, an expression for a cron"),
        forgescript_1.Arg.optionalString("timezone", "The zone to read a cron's new expression in. Left out keeps the one it had"),
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [kind, name, schedule, timezone]) {
        const manager = __1.ForgeTimers.of(ctx.client).timersManager;
        if (kind === __1.TimerKind.cron) {
            const invalid = (0, cron_1.cronError)(schedule, timezone || null);
            if (invalid)
                return this.customError(`"${schedule}" is not a cron expression: ${invalid}`);
            return this.success(await manager.rescheduleCron(name, schedule, timezone || null));
        }
        const duration = this["resolveTime"](ctx, this.fn.data.args[2], schedule, []);
        if (duration === undefined) {
            return this.customError(`"${schedule}" is not a duration a ${kind} can wait.`);
        }
        return this.success(await manager.reschedule(kind, name, duration));
    },
});
//# sourceMappingURL=rescheduleTimer.js.map