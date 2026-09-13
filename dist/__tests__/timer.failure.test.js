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
const gone = (kind, name) => (0, harness_1.waitFor)(async () => (await harness_1.Database.get(kind, name)) === null);
(0, node_test_1.describe)("a timer whose own code throws", () => {
    (0, node_test_1.it)("forgets a live timeout that blew up", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[reached]$testBoom;50;quick]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("reached")), "the timer never ran");
        strict_1.default.ok(await gone(harness_1.TimerKind.timeout, "quick"), "the record outlived the run");
        strict_1.default.equal(harness.client.timeouts.has("quick"), false);
    });
    (0, node_test_1.it)("forgets a restored timeout that blew up", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "back",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[reached]$testBoom",
            duration: 1000,
            channelID: "chan-1",
        }), Date.now() - 100);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("reached")), "the restored timer never ran");
        strict_1.default.ok(await gone(harness_1.TimerKind.timeout, "back"), "the record outlived the run");
    });
    (0, node_test_1.it)("keeps a live interval ticking past the tick that blew up", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick]$testBoom;50;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.filter((mark) => mark === "tick").length >= 3), "the interval stopped at the first error");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.interval, "beat"), "and it kept its record");
    });
    (0, node_test_1.it)("keeps a restored interval ticking too", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "beat",
            kind: harness_1.TimerKind.interval,
            code: "$testMark[tick]$testBoom",
            duration: 50,
            channelID: "chan-1",
        }), Date.now() + 50);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.filter((mark) => mark === "tick").length >= 3), "the restored interval stopped at the first error");
    });
});
//# sourceMappingURL=timer.failure.test.js.map