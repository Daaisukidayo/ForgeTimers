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
const stored = (name, duration, code = "$testMark[ran]") => new harness_1.Timer({ name, kind: harness_1.TimerKind.timeout, code, duration, channelID: "chan-1" });
(0, node_test_1.describe)("$rescheduleTimer", () => {
    (0, node_test_1.it)("moves the deadline and keeps everything else", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;n]");
        const before = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        strict_1.default.equal(await (0, harness_1.run)(harness, "$rescheduleTimer[timeout;n;30m]"), "true");
        const after = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        strict_1.default.equal(after.duration, 1_800_000);
        strict_1.default.ok(after.fireAt < before.fireAt, "the deadline was not brought forward");
        strict_1.default.equal(after.code, before.code, "the code it runs must not change");
        strict_1.default.equal(after.timestamp, before.timestamp, "it is the same timer, not a new one");
        strict_1.default.equal(harness.client.timeouts.has("n"), true, "it must still be armed");
    });
    (0, node_test_1.it)("runs on the new deadline rather than the old one", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;n]");
        await (0, harness_1.run)(harness, "$rescheduleTimer[timeout;n;60]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 3000), "it never fired on the shorter wait");
    });
    (0, node_test_1.it)("says no for a name nothing was scheduled under", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$rescheduleTimer[timeout;never;1h]"), "false");
    });
    (0, node_test_1.it)("refuses a duration an interval could never tick on", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;1h;beat]");
        await (0, harness_1.run)(harness, "$rescheduleTimer[interval;beat;0]");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.interval, "beat")).duration, 3_600_000, "it must be untouched");
    });
});
(0, node_test_1.describe)("$pauseTimer and $resumeTimer", () => {
    (0, node_test_1.it)("stops a timeout from firing, and keeps its record", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];200;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]"), "true");
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "nothing may stay armed");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "the record has to survive the pause");
        strict_1.default.equal(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 600), false, "a paused timeout must not fire");
    });
    (0, node_test_1.it)("keeps what was left of the wait rather than the wall clock", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        const paused = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        strict_1.default.ok(paused.isPaused());
        strict_1.default.ok(paused.timeLeft() > 3_599_000, `time left froze at ${paused.timeLeft()}ms`);
        strict_1.default.equal(paused.isOverdue(), false, "a paused timer never falls behind");
    });
    (0, node_test_1.it)("starts it again from where it was left", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];400;n]");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        const left = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n")).timeLeft();
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[timeout;n]"), "true");
        const resumed = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        strict_1.default.equal(resumed.pausedAt, null);
        strict_1.default.ok(Math.abs(resumed.timeLeft() - left) < 100, "it did not pick the wait back up where it stopped");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 3000), "it never fired after being resumed");
    });
    (0, node_test_1.it)("stops an interval ticking, and starts it again", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];100;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length >= 1, 2000), "it never ticked to begin with");
        await (0, harness_1.run)(harness, "$pauseTimer[interval;beat]");
        const ticked = harness_1.marks.length;
        strict_1.default.equal(await (0, harness_1.waitFor)(() => harness_1.marks.length > ticked, 400), false, "a paused interval must not tick");
        await (0, harness_1.run)(harness, "$resumeTimer[interval;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length > ticked, 3000), "it never ticked again");
    });
    (0, node_test_1.it)("is the one way a script can tell a paused timer from a missing one", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;n;paused]"), "false");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;n;paused]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;n]"), "true", "it is still a timer, just a held one");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[timeout;n]"), "false", "which is the pair's whole point");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getAllTimers[timeout;paused;,]"), "true", "and it lists like any other");
    });
    (0, node_test_1.it)("refuses to pause twice, or to resume something running", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[timeout;n]"), "false", "it was never paused");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]"), "false", "it is already on hold");
    });
    (0, node_test_1.it)("says no for a name nothing was scheduled under", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[timeout;never]"), "false");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[interval;never]"), "false");
    });
    (0, node_test_1.it)("stays paused across a restart, and is not armed by it", async () => {
        const n = stored("n", 200);
        n.pausedAt = Date.now();
        await harness_1.Database.set(n);
        await harness.ready();
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "a paused timer must not be re-armed on startup");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "nor dropped");
        strict_1.default.equal(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 500), false, "nor run, however overdue it looks");
    });
    (0, node_test_1.it)("can be resumed after that restart", async () => {
        const n = stored("n", 300);
        n.pausedAt = Date.now();
        await harness_1.Database.set(n);
        await harness.ready();
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[timeout;n]"), "true");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 3000), "the rebuilt run never fired");
    });
    (0, node_test_1.it)("leaves a paused timer paused when rescheduled, with the whole new wait ahead", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        await (0, harness_1.run)(harness, "$rescheduleTimer[timeout;n;30m]");
        const moved = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        strict_1.default.ok(moved.isPaused(), "rescheduling must not wake it");
        strict_1.default.ok(Math.abs(moved.timeLeft() - 1_800_000) < 1000, `it has ${moved.timeLeft()}ms left, not the new 30m`);
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "and nothing may be armed for it");
    });
});
(0, node_test_1.describe)("$executeTimer", () => {
    (0, node_test_1.it)("runs the stored code without spending the timer", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;n]");
        const due = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n")).fireAt;
        strict_1.default.equal(await (0, harness_1.run)(harness, "$executeTimer[timeout;n]"), "true");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 2000), "the stored code never ran");
        const after = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        strict_1.default.equal(after.fireAt, due, "its deadline moved");
        strict_1.default.equal(harness.client.timeouts.has("n"), true, "it was stood down by being run by hand");
    });
    (0, node_test_1.it)("runs an interval's code without moving it on a tick", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];1h;beat]");
        const due = (await harness_1.Database.get(harness_1.TimerKind.interval, "beat")).fireAt;
        strict_1.default.equal(await (0, harness_1.run)(harness, "$executeTimer[interval;beat]"), "true");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("tick"), 2000), "the stored code never ran");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.interval, "beat")).fireAt, due, "a hand run counted as a tick");
    });
    (0, node_test_1.it)("says no for a name nothing was stored under", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$executeTimer[timeout;never]"), "false");
    });
    (0, node_test_1.it)("runs a paused timer too, since a hold is about its schedule and not about asking", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;n]");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$executeTimer[timeout;n]"), "true");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 2000), "a hold stopped a run that was asked for");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;n;paused]"), "true", "and it is still on hold after");
    });
    (0, node_test_1.it)("tells the two kinds apart under one name", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[from-timeout];1h;n]");
        await (0, harness_1.run)(harness, "$setInterval[$testMark[from-interval];1h;n]");
        await (0, harness_1.run)(harness, "$executeTimer[interval;n]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("from-interval"), 2000), "it ran the wrong one");
        strict_1.default.ok(!harness_1.marks.includes("from-timeout"), "it ran both");
    });
});
(0, node_test_1.describe)("$findTimer", () => {
    (0, node_test_1.it)("returns only what matches, as whole timers", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;here]");
        await harness_1.Database.set(new harness_1.Timer({ name: "elsewhere", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "c2" }));
        const found = JSON.parse((await (0, harness_1.run)(harness, "$findTimer[channelID;chan-1]")));
        strict_1.default.equal(found.length, 1, `it matched ${found.length}`);
        strict_1.default.equal(found[0].name, "here");
        strict_1.default.equal(found[0].kind, "timeout", "a match carries the whole timer, not just the matched field");
    });
    (0, node_test_1.it)("needs every pair to match, not just one of them", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        await (0, harness_1.run)(harness, "$setInterval[x;1h;b]");
        const both = JSON.parse((await (0, harness_1.run)(harness, "$findTimer[channelID;chan-1;kind;interval]")));
        strict_1.default.deepEqual(both.map((timer) => timer.name), ["b"]);
    });
    (0, node_test_1.it)("matches an object against its json", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n;false]");
        const found = JSON.parse((await (0, harness_1.run)(harness, '$findTimer[config;{"persist":false}]')));
        strict_1.default.equal(found.length, 1, `matching config as json found ${found.length}`);
    });
    (0, node_test_1.it)("matches an empty value against a property the kind does not carry", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;plain]");
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;daily]");
        const gapped = JSON.parse((await (0, harness_1.run)(harness, "$findTimer[cron;]")));
        strict_1.default.deepEqual(gapped.map((timer) => timer.name), ["plain"], "only the timer with no expression should read as empty");
    });
    (0, node_test_1.it)("returns an empty list when nothing matches", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$findTimer[name;missing]"), "[]");
    });
    (0, node_test_1.it)("refuses a pair that was left without its value", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        const said = await (0, harness_1.run)(harness, "$findTimer[kind;timeout;channelID]");
        strict_1.default.notEqual(said, "[]", "an odd filter must not quietly match on the pairs it did get");
    });
    (0, node_test_1.it)("refuses to hand back everything when asked for nothing", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        strict_1.default.notEqual(await (0, harness_1.run)(harness, "$findTimer[]"), "[]", "a filterless call must not read as a match of none");
    });
});
//# sourceMappingURL=control.test.js.map