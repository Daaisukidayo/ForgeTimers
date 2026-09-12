"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const snapshotVars_1 = require("../functions/snapshotVars");
let harness;
(0, harness_1.useHarness)((booted) => (harness = booted));
function configure(timeoutConfig, intervalConfig) {
    Object.assign(harness.ext.options, { timeoutConfig, intervalConfig });
}
const stored = (kind, duration, dueIn, name = "n") => (0, harness_1.persist)(new harness_1.Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" }), Date.now() + dueIn);
(0, node_test_1.describe)("restoring timeouts", () => {
    (0, node_test_1.it)("re-arms one that is not due yet and keeps its record", async () => {
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "it is not due, it must not fire");
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
    });
    (0, node_test_1.it)("fires one that came due while the app was down, then forgets it", async () => {
        await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["n"]);
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null, "a fired timeout is spent");
    });
    (0, node_test_1.it)("discards one that is later than maxOverdue allows, without running it", async () => {
        configure({ maxOverdue: 10_000 }, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "too late to be worth running");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("measures lateness against the due time, not the downtime", async () => {
        configure({ maxOverdue: 10_000 }, {});
        await stored(harness_1.TimerKind.timeout, 90 * 24 * 60 * 60 * 1000, 60_000);
        await harness.ready();
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "a timer due later is never overdue");
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
    (0, node_test_1.it)("drops stored timers when persist is off", async () => {
        configure({ persist: false }, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000);
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
        strict_1.default.equal(harness.client.timeouts.has("n"), false);
    });
});
(0, node_test_1.describe)("restoring intervals", () => {
    (0, node_test_1.it)("drops stored intervals when persist is off", async () => {
        configure({}, { persist: false });
        await stored(harness_1.TimerKind.interval, 10_000, 60_000);
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.interval, "n"), null);
        strict_1.default.equal(harness.client.intervals.has("n"), false);
    });
    (0, node_test_1.it)("replays nothing by default", async () => {
        await stored(harness_1.TimerKind.interval, 10_000, -35_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "restoredTicksLimit defaults to 0");
        strict_1.default.equal(harness.client.intervals.has("n"), true, "but the schedule still resumes");
    });
    (0, node_test_1.it)("replays every missed tick at Infinity", async () => {
        configure({}, { restoredTicksLimit: Infinity });
        await stored(harness_1.TimerKind.interval, 10_000, -35_000);
        await harness.ready();
        strict_1.default.equal(harness_1.marks.length, 4, `expected 4 missed ticks, replayed ${harness_1.marks.length}`);
        strict_1.default.equal(harness.client.intervals.has("n"), true);
    });
    (0, node_test_1.it)("replays at most the configured number", async () => {
        configure({}, { restoredTicksLimit: 2 });
        await stored(harness_1.TimerKind.interval, 10_000, -35_000);
        await harness.ready();
        strict_1.default.equal(harness_1.marks.length, 2);
    });
    (0, node_test_1.it)("resumes on the time left rather than a whole fresh tick", { timeout: 60_000 }, async () => {
        await stored(harness_1.TimerKind.interval, 30_000, 5_000);
        await harness.ready();
        const fired = await (0, harness_1.waitFor)(() => harness_1.marks.length >= 1, 20_000);
        strict_1.default.ok(fired, "the tick was five seconds away, not 30s");
    });
    (0, node_test_1.it)("skips a stale tick past maxOverdue and carries on", async () => {
        configure({}, { maxOverdue: 1000, restoredTicksLimit: Infinity });
        await stored(harness_1.TimerKind.interval, 60_000, -60_000);
        const restoredAt = Date.now();
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "the stale tick is skipped, not replayed");
        strict_1.default.equal(harness.client.intervals.has("n"), true);
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "n");
        strict_1.default.ok(row.fireAt > restoredAt, "the schedule was moved forward");
    });
});
(0, node_test_1.describe)("a name that is already live", () => {
    (0, node_test_1.it)("is left to the timer holding it, row and all", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[live];3600000;n]");
        // straight into the database, or scheduling would just overwrite the row under test
        const stale = new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[stored]",
            duration: 1000,
            channelID: "chan-1",
        });
        await (0, harness_1.persist)(stale, Date.now() - 60_000);
        await harness.ready();
        strict_1.default.ok(!(await (0, harness_1.waitFor)(() => harness_1.marks.includes("stored"), 300)), "the stored code ran over a live timer");
        strict_1.default.equal(harness.client.timeouts.has("n"), true, "the live timer was disarmed by the restore");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "and its row was thrown away");
    });
});
(0, node_test_1.describe)("the stored schema", () => {
    (0, node_test_1.it)("leaves a row written by a newer build alone", async () => {
        const timer = await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
        timer.version = harness_1.Timer.SCHEMA_VERSION + 1;
        await harness_1.Database.set(timer);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "it must not be read with the wrong rules");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "nor thrown away");
    });
    (0, node_test_1.it)("reads a row from before the schema as plain json", async () => {
        const legacy = { $forge: "date", value: "not a date" };
        const timer = new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[$env[cfg]]",
            duration: 1000,
            channelID: "chan-1",
        });
        timer.version = null;
        timer.vars = { keywords: {}, environment: { cfg: legacy }, localFunctions: {} };
        await (0, harness_1.persist)(timer, Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [JSON.stringify(legacy, null, 4)], "a row written before the envelope existed must not be read as one");
    });
    (0, node_test_1.it)("carries a date through the database and back", async () => {
        const when = new Date("2026-08-27T12:00:00.000Z");
        const timer = new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[$env[when]]",
            duration: 1000,
            channelID: "chan-1",
            vars: (0, snapshotVars_1.snapshotVars)({ keywords: {}, environment: { when }, localFunctions: {} }, "test"),
        });
        await (0, harness_1.persist)(timer, Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [JSON.stringify(when)], "a Date renders quoted, a plain iso string renders bare and a raw envelope renders as an object");
    });
    // nothing can write this kind today: the row stands in for one a later build adds
    (0, node_test_1.it)("leaves a kind this build has no map for alone", async () => {
        const future = new harness_1.Timer({
            name: "later",
            kind: "cron",
            code: "$testMark[later]",
            duration: 1000,
            channelID: "chan-1",
        });
        await (0, harness_1.persist)(future, Date.now() - 1000);
        await stored(harness_1.TimerKind.timeout, 1000, -1000);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("n")), "one unreadable row stopped the rest of the boot");
        strict_1.default.deepEqual(harness_1.marks, ["n"], "a kind with no map behind it must not be run");
        strict_1.default.equal(harness.client.timeouts.has("later"), false);
        strict_1.default.equal(harness.client.intervals.has("later"), false);
        strict_1.default.ok(await harness_1.Database.get("cron", "later"), "the row was thrown away rather than left alone");
    });
});
//# sourceMappingURL=restore.test.js.map