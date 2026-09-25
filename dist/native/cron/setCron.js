"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const structures_1 = require("../../structures");
const cron_1 = require("../../functions/cron");
const overrides_1 = require("../../functions/overrides");
const scheduling_1 = require("../../functions/scheduling");
exports.default = new forgescript_1.NativeFunction({
    name: "$setCron",
    version: "2.0.0",
    description: "Executes code on a cron expression",
    aliases: ["$addCron", "$cron"],
    unwrap: false,
    brackets: true,
    args: [
        forgescript_1.Arg.requiredString("code", "The code to execute"),
        forgescript_1.Arg.requiredString("expression", "The cron expression to run it on, such as 0 9 * * 1-5"),
        forgescript_1.Arg.requiredString("name", "The name for this cron"),
        forgescript_1.Arg.optionalString("timezone", "The zone to read the expression in, such as Europe/London"),
        forgescript_1.Arg.optionalBoolean("persist", "Whether this cron is re-armed on startup, overriding cronConfig"),
        forgescript_1.Arg.optionalTime("maxOverdue", "How stale a missed occurrence may be on startup before it is skipped"),
        forgescript_1.Arg.optionalNumber("restoredTicksLimit", "How many occurrences missed while down to replay on startup, overriding cronConfig"),
    ],
    async execute(ctx) {
        const code = this.data.fields[0];
        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4, 5, 6);
        if (!this["isValidReturnType"](rt))
            return rt;
        const [expression, name, timezone, persist, maxOverdue, restoredTicksLimit] = args;
        const invalid = (0, scheduling_1.schedulingError)(code, __1.TimerKind.cron, name, { maxOverdue, restoredTicksLimit });
        if (invalid)
            return this.customError(invalid);
        const zone = timezone || ctx.timezone;
        const invalidCron = (0, cron_1.cronError)(expression, zone);
        if (invalidCron)
            return this.customError(`"${expression}" is not a cron expression: ${invalidCron}`);
        const { runtime, run, carries } = (0, structures_1.snapshotRunner)(ctx, (tick) => this["resolveCode"](tick, code).catch(ctx.noop));
        const timer = new __1.Timer({
            ...(0, scheduling_1.originOf)(ctx),
            name,
            kind: __1.TimerKind.cron,
            code: code.rawValue,
            cron: expression,
            timezone: zone,
            config: (0, overrides_1.overridesOf)({ persist, maxOverdue, restoredTicksLimit }),
            vars: (0, structures_1.snapshotVars)(runtime, this.fn.name),
        });
        carries(timer);
        await __1.ForgeTimers.of(ctx.client).timersManager.start(timer, run);
        return this.success();
    },
});
//# sourceMappingURL=setCron.js.map