import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { ForgeTimers } from "../.."

export default new NativeFunction({
    name: "$wipeTimers",
    version: "1.0.0",
    description: "Cancels every stored timer and wipes them from the database",
    unwrap: true,
    output: ArgType.Number,
    async execute(ctx) {
        const manager = ctx.client.getExtension(ForgeTimers, true).timersManager
        return this.success(await manager.wipe())
    }
})