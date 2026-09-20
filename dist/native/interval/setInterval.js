"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const snapshotVars_1 = require("../../functions/snapshotVars");
const structures_1 = require("../../structures");
const schedule_1 = require("../../functions/schedule");
const overrides_1 = require("../../functions/overrides");
exports.default = new forgescript_1.NativeFunction({
    name: "$setInterval",
    version: "1.0.0",
    description: "Executes code after given duration until canceled",
    unwrap: false,
    brackets: true,
    args: [
        {
            name: "code",
            description: "The code to execute",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "time",
            description: "How long to wait for before running this code",
            rest: false,
            type: forgescript_1.ArgType.Time,
        },
        {
            name: "name",
            description: "The name for this interval",
            rest: false,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "persist",
            description: "Whether this interval is re-armed on startup, overriding intervalConfig",
            rest: false,
            type: forgescript_1.ArgType.Boolean,
        },
        {
            name: "maxOverdue",
            description: "How stale a missed tick may be on startup before it is skipped, overriding intervalConfig",
            rest: false,
            type: forgescript_1.ArgType.Time,
        },
        {
            name: "restoredTicksLimit",
            description: "How many ticks missed while down to replay on startup, overriding intervalConfig",
            rest: false,
            type: forgescript_1.ArgType.Number,
        },
    ],
    async execute(ctx) {
        const code = this.data.fields[0];
        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4, 5);
        if (!this["isValidReturnType"](rt))
            return rt;
        const [time, name, persist, maxOverdue, restoredTicksLimit] = args;
        if (typeof code.rawValue !== "string") {
            return this.customError("@tryforge/forgescript v2.7.0 or newer is required.");
        }
        const duration = time || 0;
        if (duration <= 0) {
            return this.customError("An interval requires a duration greater than 0.");
        }
        if (maxOverdue !== undefined && maxOverdue < 0) {
            return this.customError("maxOverdue cannot be negative. Leave it out for no limit at all.");
        }
        if (restoredTicksLimit !== undefined && restoredTicksLimit < 0) {
            return this.customError("restoredTicksLimit cannot be negative. Use 0 to replay nothing, or Infinity to replay every missed tick.");
        }
        const { runtime, run, carries } = (0, structures_1.snapshotRunner)(ctx, (tick) => this["resolveCode"](tick, code).catch(ctx.noop));
        if (!name) {
            (0, schedule_1.setLongInterval)(duration, run);
            return this.success();
        }
        const maxNameLength = __1.Timer.maxNameLength(__1.TimerKind.interval);
        if (name.length > maxNameLength) {
            return this.customError(`An interval name may be at most ${maxNameLength} characters long, got ${name.length}.`);
        }
        const timer = new __1.Timer({
            name,
            kind: __1.TimerKind.interval,
            code: code.rawValue,
            path: ctx.cmd?.data.path ?? null,
            commandName: ctx.cmd?.data.name ?? null,
            duration,
            guildID: ctx.guild?.id ?? null,
            channelID: ctx.channel?.id ?? null,
            authorID: ctx.user?.id ?? null,
            messageID: ctx.message?.id ?? null,
            args: ctx.args.length ? [...ctx.args] : undefined,
            config: (0, overrides_1.overridesOf)({ persist, maxOverdue, restoredTicksLimit }),
            vars: (0, snapshotVars_1.snapshotVars)(runtime, this.fn.name),
        });
        carries(timer);
        await ctx.client.getExtension(__1.ForgeTimers, true).timersManager.start(timer, run);
        return this.success();
    },
});
//# sourceMappingURL=setInterval.js.map