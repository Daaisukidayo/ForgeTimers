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
        {
            name: "kind",
            description: "The kind of the timer to move, which is what the schedule below means",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.Enum,
            enum: __1.TimerKind,
        },
        {
            name: "name",
            description: "The name of the timer to move",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "schedule",
            description: "A delay for a timeout, a tick length for an interval, an expression for a cron",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "timezone",
            description: "The zone to read a cron's new expression in. Left out keeps the one it had",
            rest: false,
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [kind, name, schedule, timezone]) {
        const manager = ctx.client.getExtension(__1.ForgeTimers, true).timersManager;
        if (kind === __1.TimerKind.cron) {
            const invalid = (0, cron_1.cronError)(schedule, timezone || null);
            if (invalid)
                return this.customError(`"${schedule}" is not a cron expression: ${invalid}`);
            return this.success(await manager.rescheduleCron(name, schedule, timezone || null));
        }
        const duration = this["resolveTime"](ctx, this.fn.data.args[2], schedule, []);
        if (duration === undefined || duration < 0) {
            return this.customError(`"${schedule}" is not a duration a ${kind} can wait.`);
        }
        if (kind === __1.TimerKind.interval && !duration) {
            return this.customError("An interval requires a duration greater than 0.");
        }
        return this.success(await manager.reschedule(kind, name, duration));
    },
});
//# sourceMappingURL=rescheduleTimer.js.map