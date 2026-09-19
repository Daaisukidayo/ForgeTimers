"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$clearCron",
    version: "2.0.0",
    description: "Clears an active cron, returns bool",
    aliases: ["$stopCron", "$deleteCron"],
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "name",
            description: "The name of the cron",
            rest: false,
            required: true,
            type: forgescript_1.ArgType.String,
        },
    ],
    output: forgescript_1.ArgType.Boolean,
    async execute(ctx, [name]) {
        const manager = ctx.client.getExtension(__1.ForgeTimers, true).timersManager;
        const { cleared, forgotten } = await manager.stop(__1.TimerKind.cron, name);
        return this.success(cleared || forgotten);
    },
});
//# sourceMappingURL=clearCron.js.map