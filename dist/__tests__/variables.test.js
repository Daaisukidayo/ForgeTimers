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
/** What a tick wrote down, in the order the ticks ran */
const ticks = () => harness_1.marks.filter((mark) => mark.startsWith("saw:"));
(0, node_test_1.describe)("what a timer writes to its own variables", () => {
    (0, node_test_1.it)("never reaches the script that scheduled it", async () => {
        await (0, harness_1.run)(harness, "$let[note;before]$setTimeout[$let[note;after]$testMark[saw:$get[note]];40;t]$testMark[outer:$get[note]]");
        strict_1.default.ok(await (0, harness_1.marked)("saw:after"), "a timer has to see its own write");
        strict_1.default.ok(harness_1.marks.includes("outer:before"), `the write escaped into the scheduling script: ${harness_1.marks}`);
    });
    (0, node_test_1.it)("never reaches the next tick of an interval", async () => {
        await (0, harness_1.run)(harness, "$let[note;before]$setInterval[$testMark[saw:$get[note]]$let[note;after];50;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => ticks().length >= 3), "the interval never ticked enough to tell");
        strict_1.default.deepEqual(ticks().slice(0, 3), ["saw:before", "saw:before", "saw:before"], "a tick inherited a write");
    });
    (0, node_test_1.it)("never reaches the row the timer is stored in", async () => {
        await (0, harness_1.run)(harness, "$let[note;before]$setInterval[$testMark[saw:$get[note]]$let[note;after];50;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => ticks().length >= 2));
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "beat");
        strict_1.default.equal(row.vars.keywords.note, "before", "the stored snapshot was written over by a tick");
    });
    (0, node_test_1.it)("never reaches the next tick after a restart either", async () => {
        const beat = new harness_1.Timer({
            name: "beat",
            kind: harness_1.TimerKind.interval,
            code: "$testMark[saw:$get[note]]$let[note;after]",
            duration: 50,
            channelID: "chan-1",
            vars: { keywords: { note: "before" }, environment: {}, localFunctions: {} },
        });
        beat.version = harness_1.Timer.SCHEMA_VERSION;
        await (0, harness_1.persist)(beat, Date.now() + 50);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => ticks().length >= 3), "the restored interval never ticked enough to tell");
        strict_1.default.deepEqual(ticks().slice(0, 3), ["saw:before", "saw:before", "saw:before"], "a tick inherited a write");
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "beat");
        strict_1.default.equal(row.vars.keywords.note, "before", "the stored snapshot was written over by a tick");
    });
});
//# sourceMappingURL=variables.test.js.map