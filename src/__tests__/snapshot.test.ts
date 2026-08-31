import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Compiler, FunctionManager } from "@tryforge/forgescript"
import { rehydrateLocalFunctions, restoreVars, snapshotVars, VARS_SCHEMA_VERSION } from "../functions/snapshotVars"

FunctionManager.loadNative()

class Dummy {
    public label = "class instance"
}

const snapshot = (environment: Record<string, unknown>) =>
    restoreVars(snapshotVars({ environment, keywords: {}, localFunctions: {} }, "test").environment, VARS_SCHEMA_VERSION)

describe("snapshotVars", () => {
    it("keeps the json-safe values", () => {
        const kept = snapshot({
            string: "hello",
            number: 42,
            boolean: true,
            null: null,
            array: [1, "two", { three: 3 }],
            nested: { a: { b: { c: "deep" } } },
        })

        assert.deepEqual(kept, {
            string: "hello",
            number: 42,
            boolean: true,
            null: null,
            array: [1, "two", { three: 3 }],
            nested: { a: { b: { c: "deep" } } },
        })
    })

    it("carries dates, maps, sets, regexps and bigints through", () => {
        const date = new Date("2026-08-27T12:00:00.000Z")
        const kept = snapshot({
            date,
            map: new Map<unknown, unknown>([["k", "v"], [1, { n: 2 }]]),
            set: new Set([1, "two"]),
            regexp: /abc/gi,
            bigint: 123n,
        })

        assert.ok(kept.date instanceof Date)
        assert.equal((kept.date as Date).toISOString(), date.toISOString())

        assert.ok(kept.map instanceof Map)
        assert.equal((kept.map as Map<unknown, unknown>).get("k"), "v")
        assert.deepEqual((kept.map as Map<unknown, unknown>).get(1), { n: 2 })

        assert.ok(kept.set instanceof Set)
        assert.deepEqual([...(kept.set as Set<unknown>)], [1, "two"])

        assert.ok(kept.regexp instanceof RegExp)
        assert.equal((kept.regexp as RegExp).source, "abc")
        assert.equal((kept.regexp as RegExp).flags, "gi")

        assert.equal(kept.bigint, 123n)
    })

    it("still drops what has no meaning after a restart", () => {
        const kept = snapshot({
            fn: () => "nope",
            classInstance: new Dummy(),
            nan: NaN,
            infinity: Infinity,
            undef: undefined,
        })

        assert.deepEqual(Object.keys(kept), [], `kept ${Object.keys(kept).join(", ")}`)
    })

    it("truncates a cycle rather than losing everything around it", () => {
        const circular: Record<string, unknown> = { name: "circular" }
        circular.self = circular

        const kept = snapshot({ circular }) as { circular: Record<string, unknown> }
        assert.equal(kept.circular.name, "circular")
        assert.equal("self" in kept.circular, false)
    })

    it("keeps the sound part of an object and drops only what it cannot hold", () => {
        const kept = snapshot({ mixed: { ok: 1, when: new Date(0), bad: () => 1 } }) as {
            mixed: { ok: number; when: Date; bad?: unknown }
        }

        assert.equal(kept.mixed.ok, 1)
        assert.ok(kept.mixed.when instanceof Date)
        assert.equal("bad" in kept.mixed, false)
    })

    it("keeps an array the same length by nulling what it cannot hold", () => {
        const kept = snapshot({ list: [1, () => 2, 3] }) as { list: unknown[] }
        assert.deepEqual(kept.list, [1, null, 3])
    })

    it("does not mistake a user object carrying the tag key for an envelope", () => {
        const kept = snapshot({ tricky: { $forge: "date", value: "not a date", extra: 1 } }) as {
            tricky: Record<string, unknown>
        }

        assert.equal(kept.tricky instanceof Date, false)
        assert.deepEqual(kept.tricky, { $forge: "date", value: "not a date", extra: 1 })
    })

    it("keeps a value referenced twice, which is not a cycle", () => {
        const shared = { n: 1 }
        const kept = snapshot({ both: { a: shared, b: shared } })
        assert.deepEqual(kept, { both: { a: { n: 1 }, b: { n: 1 } } })
    })

    it("detaches the snapshot from the live object", () => {
        const live = { nested: { n: 1 } }
        const kept = snapshot({ live }) as { live: { nested: { n: number } } }
        live.nested.n = 99
        assert.equal(kept.live.nested.n, 1, "the snapshot must not follow later edits")
    })

    it("carries keywords and environment separately", () => {
        const out = snapshotVars(
            { keywords: { k: "kept" }, environment: { e: "kept" }, localFunctions: {} },
            "test"
        )
        assert.deepEqual(out.keywords, { k: "kept" })
        assert.deepEqual(out.environment, { e: "kept" })
    })

    it("reads a record written before the schema existed as plain json", () => {
        const legacy = { plain: "value", nested: { n: 1 } }
        assert.deepEqual(restoreVars(legacy, 0), legacy)
    })

    it("leaves an unknown tag out rather than guessing", () => {
        assert.deepEqual(restoreVars({ odd: { $forge: "something-new", value: 1 } }, VARS_SCHEMA_VERSION), {})
    })
})

describe("rehydrateLocalFunctions", () => {
    it("recompiles a stored function", () => {
        const out = rehydrateLocalFunctions({ greet: { code: "hello", args: ["name"] } }, null, "test")
        assert.deepEqual(Object.keys(out), ["greet"])
        assert.deepEqual(out.greet.args, ["name"])
        assert.equal(out.greet.code.rawValue, "hello")
    })

    it("round-trips through snapshotVars", () => {
        const compiled = Compiler.compile("hello")
        const snapped = snapshotVars(
            {
                keywords: {},
                environment: {},
                localFunctions: {
                    greet: { args: ["name"], code: { rawValue: "hello", ...compiled } as never },
                },
            },
            "test"
        )

        const out = rehydrateLocalFunctions(snapped.localFunctions, null, "test")
        assert.equal(out.greet.code.rawValue, "hello")
        assert.deepEqual(out.greet.args, ["name"])
    })

    it("drops a function that no longer compiles instead of throwing", () => {
        const out = rehydrateLocalFunctions(
            { broken: { code: "$if[", args: [] }, fine: { code: "ok", args: [] } },
            null,
            "test"
        )
        assert.deepEqual(Object.keys(out), ["fine"])
    })

    it("returns nothing when there is nothing stored", () => {
        assert.deepEqual(rehydrateLocalFunctions(undefined, null, "test"), {})
    })
})
