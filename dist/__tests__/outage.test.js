"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
let harness;
(0, harness_1.useHarness)((booted) => (harness = booted));
/** Takes a call away the way a connection dropped after startup would */
function breaks(...calls) {
    for (const call of calls) {
        (0, harness_1.patchDatabase)(call, () => async () => {
            throw new Error(`the database went away (${call})`);
        });
    }
}
const timer = (name, kind = harness_1.TimerKind.timeout, duration = 50) => new harness_1.Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" });
(0, node_test_1.describe)("a database that fails after startup", () => {
    (0, node_test_1.it)("keeps running a timer it could not write down", async () => {
        breaks("set");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$setTimeout[$testMark[unsaved];50;n]"), "");
        strict_1.default.ok(harness.client.timeouts.has("n"), "a failed write must not cost the live timer");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("unsaved")), "the timer never ran");
    });
    (0, node_test_1.it)("keeps ticking an interval it could not write down", async () => {
        breaks("set");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];50;n]"), "");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.filter((m) => m === "tick").length >= 2), "the interval stopped");
    });
    (0, node_test_1.it)("still fires a timeout whose row it cannot delete afterwards", async () => {
        await harness.ext.timersManager.start(timer("n"), async () => void harness_1.marks.push("fired"));
        breaks("delete");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("fired")), "the timer never ran");
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "the live handle outlived the run");
    });
    (0, node_test_1.it)("cancels a timer it cannot forget, and says the row is still there", async () => {
        await harness.ext.timersManager.start(timer("n", harness_1.TimerKind.timeout, 60_000), async () => void 0);
        breaks("delete");
        strict_1.default.deepEqual(await harness.ext.timersManager.stop(harness_1.TimerKind.timeout, "n"), [true, false], "a failed delete must not be reported as a forgotten timer");
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "the live timer was left armed");
    });
    (0, node_test_1.it)("reports a clear as done when only the live timer could be cancelled", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[cleared];60000;n]");
        breaks("delete");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimeout[n]"), "true");
        strict_1.default.equal(harness.client.timeouts.has("n"), false);
    });
    (0, node_test_1.it)("cancels every live timer even when the table cannot be emptied", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[a];60000;a]");
        await (0, harness_1.run)(harness, "$setInterval[$testMark[b];60000;b]");
        breaks("wipe");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$wipeTimers"), "2");
        strict_1.default.equal(harness.client.timeouts.size, 0);
        strict_1.default.equal(harness.client.intervals.size, 0);
    });
    (0, node_test_1.it)("boots without restoring anything when the timers cannot be read", async () => {
        await (0, harness_1.persist)(timer("n", harness_1.TimerKind.timeout, 60_000), Date.now() - 1000);
        breaks("getAll");
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "a timer was restored out of a read that failed");
        strict_1.default.equal(harness.client.timeouts.size, 0);
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "the record was dropped over a failed read");
    });
});
//# sourceMappingURL=outage.test.js.map