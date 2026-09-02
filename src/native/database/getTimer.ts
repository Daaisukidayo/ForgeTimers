import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { TimerProperties, TimerProperty } from "../../properties/timer"
import { Database, TimerKind } from "../.."

export default new NativeFunction({
    name: "$getTimer",
    version: "1.1.0",
    description: "Gets an existing timer from the database",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "kind",
            description: "Whether to look for a timeout or an interval",
            rest: false,
            required: true,
            type: ArgType.Enum,
            enum: TimerKind
        },
        {
            name: "name",
            description: "The name of the timer to get",
            rest: false,
            required: true,
            type: ArgType.String,
        },
        {
            name: "property",
            description: "The property of the timer to return",
            rest: false,
            type: ArgType.Enum,
            enum: TimerProperty
        }
    ],
    output: [
        ArgType.Json,
        ArgType.Unknown
    ],
    async execute(ctx, [kind, name, prop]) {
        const timer = await Database.get(kind, name)
        if (!timer) return this.success()

        if (prop) {
            const value = TimerProperties[prop](timer)
            return typeof value === "object" && value !== null
                ? this.successJSON(value)
                : this.success(value)
        }
        return this.successJSON(timer)
    }
})