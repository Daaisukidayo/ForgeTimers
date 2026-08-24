import { NativeFunction, ArgType } from "@tryforge/forgescript"

class Dummy {
    public label
    constructor() {
        this.label = "class instance"
    }
}

export default new NativeFunction({
        name: "$pollute",
        description: "fills the context with values of every kind",
        unwrap: true,
        output: ArgType.String,
        execute(ctx) {
            const circular = { name: "circular" }
            // @ts-ignore
            circular.self = circular

            // --- should SURVIVE ---
            ctx.setEnvironmentKey("keepString", "hello")
            ctx.setEnvironmentKey("keepNumber", 42)
            ctx.setEnvironmentKey("keepBool", true)
            ctx.setEnvironmentKey("keepNull", null)
            ctx.setEnvironmentKey("keepArray", [1, "two", { three: 3 }])
            ctx.setEnvironmentKey("keepNested", { a: { b: { c: "deep" } } })

            // --- should be DROPPED ---
            ctx.setEnvironmentKey("dropDate", new Date())
            ctx.setEnvironmentKey("dropMap", new Map([["k", "v"]]))
            ctx.setEnvironmentKey("dropSet", new Set([1, 2]))
            ctx.setEnvironmentKey("dropBigint", 123n)
            ctx.setEnvironmentKey("dropFunction", () => "nope")
            ctx.setEnvironmentKey("dropClass", new Dummy())
            ctx.setEnvironmentKey("dropCircular", circular)
            ctx.setEnvironmentKey("dropNaN", NaN)
            ctx.setEnvironmentKey("dropInfinity", Infinity)
            ctx.setEnvironmentKey("dropRegExp", /abc/g)
            // the whole key must go
            ctx.setEnvironmentKey("dropNestedBad", { ok: 1, bad: new Date() })
            // a live discord.js structure, the realistic case
            ctx.setEnvironmentKey("dropChannel", ctx.channel)

            return this.success("polluted")
        },
    })