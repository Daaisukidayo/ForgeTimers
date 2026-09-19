"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
const snapshotVars_1 = require("../../functions/snapshotVars");
const schedule_1 = require("../../functions/schedule");
const overrides_1 = require("../../functions/overrides");
exports.default = new forgescript_1.NativeFunction({
    name: "$setTimeout",
    version: "1.0.0",
    description: "Executes code after given duration",
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
            description: "The name for this timeout",
            rest: false,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "persist",
            description: "Whether this timeout is re-armed on startup, overriding timeoutConfig",
            rest: false,
            type: forgescript_1.ArgType.Boolean,
        },
        {
            name: "maxOverdue",
            description: "How late this timeout may be on startup before it is discarded, overriding timeoutConfig",
            rest: false,
            type: forgescript_1.ArgType.Time,
        },
    ],
    async execute(ctx) {
        const code = this.data.fields[0];
        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2, 3, 4);
        if (!this["isValidReturnType"](rt))
            return rt;
        const [time, name, persist, maxOverdue] = args;
        if (typeof code.rawValue !== "string") {
            return this.customError("@tryforge/forgescript v2.7.0 or newer is required.");
        }
        const duration = time || 0;
        if (duration < 0) {
            return this.customError("A timeout cannot be scheduled with a negative duration.");
        }
        if (maxOverdue !== undefined && maxOverdue < 0) {
            return this.customError("maxOverdue cannot be negative. Leave it out for no limit at all.");
        }
        const runtime = ctx.cloneRuntime();
        const runner = ctx.clone(runtime);
        const run = async () => void (await this["resolveCode"](runner, code).catch(ctx.noop));
        if (!name) {
            (0, schedule_1.setLongTimeout)(duration, run);
            return this.success();
        }
        const maxNameLength = __1.Timer.maxNameLength(__1.TimerKind.timeout);
        if (name.length > maxNameLength) {
            return this.customError(`A timeout name may be at most ${maxNameLength} characters long, got ${name.length}.`);
        }
        const timer = new __1.Timer({
            name,
            kind: __1.TimerKind.timeout,
            code: code.rawValue,
            path: ctx.cmd?.data.path ?? null,
            commandName: ctx.cmd?.data.name ?? null,
            duration,
            guildID: ctx.guild?.id ?? null,
            channelID: ctx.channel?.id ?? null,
            hostID: ctx.user?.id ?? null,
            messageID: ctx.message?.id ?? null,
            args: ctx.args.length ? [...ctx.args] : undefined,
            config: (0, overrides_1.overridesOf)({ persist, maxOverdue }),
            vars: (0, snapshotVars_1.snapshotVars)(runtime, this.fn.name),
        });
        await ctx.client.getExtension(__1.ForgeTimers, true).timersManager.start(timer, run);
        return this.success();
    },
});
//# sourceMappingURL=setTimeout.js.map