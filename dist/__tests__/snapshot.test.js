"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const forgescript_1 = require("@tryforge/forgescript");
const snapshotVars_1 = require("../functions/snapshotVars");
forgescript_1.FunctionManager.loadNative();
class Dummy {
    label = "class instance";
}
const snapshot = (environment) => (0, snapshotVars_1.restoreVars)((0, snapshotVars_1.snapshotVars)({ environment, keywords: {}, localFunctions: {} }, "test").environment, snapshotVars_1.VARS_SCHEMA_VERSION);
(0, node_test_1.describe)("snapshotVars", () => {
    (0, node_test_1.it)("keeps the json-safe values", () => {
        const kept = snapshot({
            string: "hello",
            number: 42,
            boolean: true,
            null: null,
            array: [1, "two", { three: 3 }],
            nested: { a: { b: { c: "deep" } } },
        });
        strict_1.default.deepEqual(kept, {
            string: "hello",
            number: 42,
            boolean: true,
            null: null,
            array: [1, "two", { three: 3 }],
            nested: { a: { b: { c: "deep" } } },
        });
    });
    (0, node_test_1.it)("carries dates, maps, sets, regexps and bigints through", () => {
        const date = new Date("2026-08-27T12:00:00.000Z");
        const kept = snapshot({
            date,
            map: new Map([["k", "v"], [1, { n: 2 }]]),
            set: new Set([1, "two"]),
            regexp: /abc/gi,
            bigint: 123n,
        });
        strict_1.default.ok(kept.date instanceof Date);
        strict_1.default.equal(kept.date.toISOString(), date.toISOString());
        strict_1.default.ok(kept.map instanceof Map);
        strict_1.default.equal(kept.map.get("k"), "v");
        strict_1.default.deepEqual(kept.map.get(1), { n: 2 });
        strict_1.default.ok(kept.set instanceof Set);
        strict_1.default.deepEqual([...kept.set], [1, "two"]);
        strict_1.default.ok(kept.regexp instanceof RegExp);
        strict_1.default.equal(kept.regexp.source, "abc");
        strict_1.default.equal(kept.regexp.flags, "gi");
        strict_1.default.equal(kept.bigint, 123n);
    });
    (0, node_test_1.it)("still drops what has no meaning after a restart", () => {
        const kept = snapshot({
            fn: () => "nope",
            classInstance: new Dummy(),
            nan: NaN,
            infinity: Infinity,
            undef: undefined,
        });
        strict_1.default.deepEqual(Object.keys(kept), [], `kept ${Object.keys(kept).join(", ")}`);
    });
    (0, node_test_1.it)("truncates a cycle rather than losing everything around it", () => {
        const circular = { name: "circular" };
        circular.self = circular;
        const kept = snapshot({ circular });
        strict_1.default.equal(kept.circular.name, "circular");
        strict_1.default.equal("self" in kept.circular, false);
    });
    (0, node_test_1.it)("keeps the sound part of an object and drops only what it cannot hold", () => {
        const kept = snapshot({ mixed: { ok: 1, when: new Date(0), bad: () => 1 } });
        strict_1.default.equal(kept.mixed.ok, 1);
        strict_1.default.ok(kept.mixed.when instanceof Date);
        strict_1.default.equal("bad" in kept.mixed, false);
    });
    (0, node_test_1.it)("keeps an array the same length by nulling what it cannot hold", () => {
        const kept = snapshot({ list: [1, () => 2, 3] });
        strict_1.default.deepEqual(kept.list, [1, null, 3]);
    });
    (0, node_test_1.it)("does not mistake a user object carrying the tag key for an envelope", () => {
        const kept = snapshot({ tricky: { $forge: "date", value: "not a date", extra: 1 } });
        strict_1.default.equal(kept.tricky instanceof Date, false);
        strict_1.default.deepEqual(kept.tricky, { $forge: "date", value: "not a date", extra: 1 });
    });
    (0, node_test_1.it)("keeps a value referenced twice, which is not a cycle", () => {
        const shared = { n: 1 };
        const kept = snapshot({ both: { a: shared, b: shared } });
        strict_1.default.deepEqual(kept, { both: { a: { n: 1 }, b: { n: 1 } } });
    });
    (0, node_test_1.it)("detaches the snapshot from the live object", () => {
        const live = { nested: { n: 1 } };
        const kept = snapshot({ live });
        live.nested.n = 99;
        strict_1.default.equal(kept.live.nested.n, 1, "the snapshot must not follow later edits");
    });
    (0, node_test_1.it)("carries keywords and environment separately", () => {
        const out = (0, snapshotVars_1.snapshotVars)({ keywords: { k: "kept" }, environment: { e: "kept" }, localFunctions: {} }, "test");
        strict_1.default.deepEqual(out.keywords, { k: "kept" });
        strict_1.default.deepEqual(out.environment, { e: "kept" });
    });
    (0, node_test_1.it)("reads a record written before the schema existed as plain json", () => {
        const legacy = { plain: "value", nested: { n: 1 } };
        strict_1.default.deepEqual((0, snapshotVars_1.restoreVars)(legacy, 0), legacy);
    });
    (0, node_test_1.it)("leaves an unknown tag out rather than guessing", () => {
        strict_1.default.deepEqual((0, snapshotVars_1.restoreVars)({ odd: { $forge: "something-new", value: 1 } }, snapshotVars_1.VARS_SCHEMA_VERSION), {});
    });
});
(0, node_test_1.describe)("rehydrateLocalFunctions", () => {
    (0, node_test_1.it)("recompiles a stored function", () => {
        const out = (0, snapshotVars_1.rehydrateLocalFunctions)({ greet: { code: "hello", args: ["name"] } }, null, "test");
        strict_1.default.deepEqual(Object.keys(out), ["greet"]);
        strict_1.default.deepEqual(out.greet.args, ["name"]);
        strict_1.default.equal(out.greet.code.rawValue, "hello");
    });
    (0, node_test_1.it)("round-trips through snapshotVars", () => {
        const compiled = forgescript_1.Compiler.compile("hello");
        const snapped = (0, snapshotVars_1.snapshotVars)({
            keywords: {},
            environment: {},
            localFunctions: {
                greet: { args: ["name"], code: { rawValue: "hello", ...compiled } },
            },
        }, "test");
        const out = (0, snapshotVars_1.rehydrateLocalFunctions)(snapped.localFunctions, null, "test");
        strict_1.default.equal(out.greet.code.rawValue, "hello");
        strict_1.default.deepEqual(out.greet.args, ["name"]);
    });
    (0, node_test_1.it)("drops a function that no longer compiles instead of throwing", () => {
        const out = (0, snapshotVars_1.rehydrateLocalFunctions)({ broken: { code: "$if[", args: [] }, fine: { code: "ok", args: [] } }, null, "test");
        strict_1.default.deepEqual(Object.keys(out), ["fine"]);
    });
    (0, node_test_1.it)("returns nothing when there is nothing stored", () => {
        strict_1.default.deepEqual((0, snapshotVars_1.rehydrateLocalFunctions)(undefined, null, "test"), {});
    });
});
//# sourceMappingURL=snapshot.test.js.map