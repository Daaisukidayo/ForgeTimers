"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./support/harness");
let harness;
(0, harness_1.useHarness)((booted) => (harness = booted));
function configure(timeoutConfig, intervalConfig) {
    Object.assign(harness.ext.options, { timeoutConfig, intervalConfig });
}
const stored = (kind, duration, dueIn, config) => (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind, code: "$testMark[n]", duration, channelID: "chan-1", config }), Date.now() + dueIn);
(0, node_test_1.describe)("what a call records for itself", () => {
    (0, node_test_1.it)("keeps only the options it was given", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n;false]");
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "n");
        strict_1.default.deepEqual(row.config, { persist: false }, "maxOverdue was never passed, so it must not be stored");
    });
    (0, node_test_1.it)("stores nothing when the call names no options", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "n");
        strict_1.default.equal(row.config, null);
    });
    (0, node_test_1.it)("reads a duration for maxOverdue the same way it reads the delay", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;1h;n;;30m;5]");
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "n");
        strict_1.default.deepEqual(row.config, { maxOverdue: 1_800_000, restoredTicksLimit: 5 });
    });
    (0, node_test_1.it)("records a cron's own options the same way an interval's", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;n;;;30m;5]");
        const row = await harness_1.Database.get(harness_1.TimerKind.cron, "n");
        strict_1.default.deepEqual(row.config, { maxOverdue: 1_800_000, restoredTicksLimit: 5 });
    });
    (0, node_test_1.it)("writes Infinity as a string, which is the only way it survives JSON", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;1h;n;;;Infinity]");
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "n");
        strict_1.default.equal(row.config.restoredTicksLimit, "Infinity", "as a number it would read back as null");
    });
    (0, node_test_1.it)("refuses a negative maxOverdue on a timeout", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n;;-1]");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null, "nothing should have been scheduled");
        strict_1.default.equal(harness.client.timeouts.has("n"), false);
    });
    (0, node_test_1.it)("refuses a negative tick limit rather than silently replaying nothing", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;1h;n;;;-1]");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.interval, "n"), null, "nothing should have been scheduled");
        strict_1.default.equal(harness.client.intervals.has("n"), false);
    });
});
(0, node_test_1.describe)("reading the options back", () => {
    (0, node_test_1.it)("hands $getTimer what the call spelled out", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;1h;n;false;;Infinity]");
        const read = await (0, harness_1.run)(harness, "$getTimer[interval;n;config]");
        strict_1.default.deepEqual(JSON.parse(`${read}`), { persist: false, restoredTicksLimit: "Infinity" });
    });
    (0, node_test_1.it)("reads as an empty object for a timer that named none", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        const read = await (0, harness_1.run)(harness, "$getTimer[timeout;n;config]");
        strict_1.default.deepEqual(JSON.parse(`${read}`), {}, "config reads as an object, not as null");
    });
});
(0, node_test_1.describe)("which config wins on restore", () => {
    (0, node_test_1.it)("prefers the timer's own persist over the extension's", async () => {
        configure({ persist: true }, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000, { persist: false });
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null, "the timer opted out of being re-armed");
        strict_1.default.equal(harness.client.timeouts.has("n"), false);
    });
    (0, node_test_1.it)("falls back to the extension's config when the timer names nothing", async () => {
        configure({ persist: false }, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000, null);
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null, "the config said not to persist");
    });
    (0, node_test_1.it)("falls back to the default when neither names anything", async () => {
        configure({}, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000, null);
        await harness.ready();
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "persist defaults to true");
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
    (0, node_test_1.it)("prefers the timer's own maxOverdue over the extension's", async () => {
        // the config would have kept this one, its own limit throws it away
        configure({ maxOverdue: 3_600_000 }, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000, { maxOverdue: 1000 });
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "it was past its own limit, so it must not have run");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("prefers the timer's own maxOverdue on an interval, which skips the tick instead of dropping it", async () => {
        // the config would have replayed the missed ticks, its own limit makes them all stale
        configure({}, { maxOverdue: 3_600_000, restoredTicksLimit: Infinity });
        await stored(harness_1.TimerKind.interval, 10_000, -35_000, { maxOverdue: 1000 });
        const restoredAt = Date.now();
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "the stale ticks must be skipped, not replayed");
        strict_1.default.equal(harness.client.intervals.has("n"), true, "an interval past maxOverdue resumes, it is not dropped");
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "n");
        strict_1.default.ok(row.fireAt > restoredAt, "the schedule was moved forward");
    });
    (0, node_test_1.it)("prefers the timer's own persist on an interval", async () => {
        configure({}, { persist: true });
        await stored(harness_1.TimerKind.interval, 10_000, 60_000, { persist: false });
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.interval, "n"), null, "the interval opted out of being re-armed");
        strict_1.default.equal(harness.client.intervals.has("n"), false);
    });
    (0, node_test_1.it)("prefers the timer's own restoredTicksLimit over the extension's", async () => {
        configure({}, { restoredTicksLimit: 0 });
        await stored(harness_1.TimerKind.interval, 10_000, -35_000, { restoredTicksLimit: 2 });
        await harness.ready();
        strict_1.default.equal(harness_1.marks.length, 2, `the config said replay nothing, the timer said 2, got ${harness_1.marks.length}`);
    });
    (0, node_test_1.it)("still reads the extension's config for what the timer left out", async () => {
        // only persist is spelled out, so the tick limit must still come from the config
        configure({}, { restoredTicksLimit: 3 });
        await stored(harness_1.TimerKind.interval, 10_000, -35_000, { persist: true });
        await harness.ready();
        strict_1.default.equal(harness_1.marks.length, 3, `expected the config's 3 ticks, got ${harness_1.marks.length}`);
    });
    (0, node_test_1.it)("replays every missed tick for a timer that stored Infinity", async () => {
        configure({}, { restoredTicksLimit: 0 });
        await stored(harness_1.TimerKind.interval, 10_000, -35_000, { restoredTicksLimit: "Infinity" });
        await harness.ready();
        strict_1.default.equal(harness_1.marks.length, 4, `the stored string must read back as Infinity, replayed ${harness_1.marks.length}`);
    });
});
//# sourceMappingURL=overrides.test.js.map