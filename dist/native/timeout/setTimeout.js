"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const timersStore_1 = require("../../timersStore");
const varsSnapshot_1 = require("../../varsSnapshot");
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
    ],
    async execute(ctx) {
        const code = this.data.fields[0];
        const { args, return: rt } = await this["resolveMultipleArgs"](ctx, 1, 2);
        if (!this["isValidReturnType"](rt))
            return rt;
        const [time, name] = args;
        const delay = time || 0;
        const store = ctx.client.get("timersStores")?.get(timersStore_1.TimerKind.Timeout);
        if (name) {
            const previous = ctx.client.timeouts.get(name);
            if (previous) {
                clearTimeout(previous);
                forgescript_1.Logger.warn(`${this.fn.name} | Replacing existing timeout "${name}"`);
            }
            if (store) {
                const record = {
                    id: name,
                    kind: timersStore_1.TimerKind.Timeout,
                    code: code.rawValue,
                    path: ctx.cmd?.data.path ?? null,
                    fireAt: Date.now() + delay,
                    guildId: ctx.guild?.id ?? null,
                    channelId: ctx.channel.id,
                    userId: ctx.user?.id ?? null,
                    messageId: ctx.message?.id ?? null,
                    vars: (0, varsSnapshot_1.snapshotVars)(ctx.cloneRuntime(), this.fn.name),
                };
                await store.save(record).catch((err) => forgescript_1.Logger.error(err));
            }
        }
        const c = ctx.clone(ctx.cloneRuntime());
        const timer = setTimeout(async () => {
            await this["resolveCode"](c, code).catch(ctx.noop);
            if (name) {
                ctx.client.timeouts.delete(name);
                await store?.delete(name).catch((err) => forgescript_1.Logger.error(err));
            }
        }, delay || undefined);
        if (name)
            ctx.client.timeouts.set(name, timer);
        return this.success();
    },
});
//# sourceMappingURL=setTimeout.js.map