"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");
exports.default = new forgescript_1.NativeFunction({
    name: "$wipeTimers",
    version: "1.0.0",
    description: "Cancels every stored timer and wipes them from the database",
    unwrap: true,
    output: forgescript_1.ArgType.Number,
    async execute(ctx) {
        const manager = ctx.client.getExtension(__1.ForgeTimers, true).timersManager;
        return this.success(await manager.wipe());
    }
});
//# sourceMappingURL=wipeTimers.js.map