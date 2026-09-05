import { ArgType, NativeFunction } from "@tryforge/forgescript"
import { report } from "../smoke"

export default new NativeFunction({
    name: "$smokeReport",
    description: "records that a smoke timer reached this point, for the live restart check",
    unwrap: true,
    brackets: true,
    args: [
        {
            name: "label",
            description: "which timer ran",
            required: true,
            rest: false,
            type: ArgType.String,
        },
    ],
    execute(ctx, [label]) {
        report(label as string)
        return this.success()
    },
})
