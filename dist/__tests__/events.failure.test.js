"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const types_1 = require("../types");
let harness;
(0, node_test_1.before)(async () => {
    harness = await (0, harness_1.boot)({ events: [types_1.TimerEvent.timerStart, types_1.TimerEvent.timerFire, types_1.TimerEvent.timerCancel] });
    harness.channels.set("chan-1", { id: "chan-1" });
    for (const event of [types_1.TimerEvent.timerStart, types_1.TimerEvent.timerFire, types_1.TimerEvent.timerCancel]) {
        harness.ext.commands.add({ type: event, code: `$testMark[${event}-reached]$testBoom` });
    }
});
(0, node_test_1.beforeEach)(async () => {
    harness.disarm();
    await harness_1.Database.wipe();
    harness_1.marks.length = 0;
});
(0, node_test_1.after)(async () => {
    harness.disarm();
    await harness.cleanup();
});
const marked = (mark) => (0, harness_1.waitFor)(() => harness_1.marks.includes(mark));
(0, node_test_1.describe)("an event command that throws", () => {
    (0, node_test_1.it)("still lets the timer be scheduled and stored", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;reminder]");
        strict_1.default.ok(await marked(`${types_1.TimerEvent.timerStart}-reached`), "the event command never ran to throw");
        strict_1.default.ok(harness.client.timeouts.has("reminder"), "the timer was never armed");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder"), "the timer was never stored");
    });
    (0, node_test_1.it)("still lets a timeout run and forget itself", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];50;quick]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran")), "the timer never ran");
        strict_1.default.ok(await marked(`${types_1.TimerEvent.timerFire}-reached`), "the event command never ran to throw");
        strict_1.default.ok(await (0, harness_1.waitFor)(async () => (await harness_1.Database.get(harness_1.TimerKind.timeout, "quick")) === null), "the record outlived the run");
    });
    (0, node_test_1.it)("still lets an interval keep ticking", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];50;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.filter((mark) => mark === "tick").length >= 3), "the interval stopped");
    });
    (0, node_test_1.it)("still lets a timer be cancelled", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;reminder]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimeout[reminder]"), "true");
        strict_1.default.ok(await marked(`${types_1.TimerEvent.timerCancel}-reached`), "the event command never ran to throw");
        strict_1.default.equal(harness.client.timeouts.has("reminder"), false);
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder"), null);
    });
});
//# sourceMappingURL=events.failure.test.js.map