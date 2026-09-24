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
    (0, node_test_1.it)("takes any duration the set natives would take", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];1h;beat]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$rescheduleTimer[interval;beat;0]"), "true");
        const ticked = await (0, harness_1.waitFor)(() => harness_1.marks.filter((mark) => mark === "tick").length >= 2, 2000);
        harness.disarm();
        strict_1.default.ok(ticked, "the new schedule was never armed");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.interval, "beat")).duration, 0, "it is stored as it was given");
    });
    (0, node_test_1.it)("still refuses a schedule it cannot read at all", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;n]");
        strict_1.default.notEqual(await (0, harness_1.run)(harness, "$rescheduleTimer[timeout;n;banana]"), "true", "it reported a move it never made");
        strict_1.default.ok(!(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 300)), "an unreadable schedule fired the timer at once");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "and then spent its record");
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
(0, node_test_1.describe)("a timer reading itself", () => {
    (0, node_test_1.it)("knows its own name and kind while it runs", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[me:$timerData[name]:$timerData[kind]];50;mine]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("me:mine:timeout"), 3000), `it saw ${harness_1.marks}`);
    });
    (0, node_test_1.it)("reads the same on every tick of an interval", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[beat:$timerData[name]];60;drum]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.filter((m) => m === "beat:drum").length >= 2, 3000), `it saw ${harness_1.marks}`);
    });
    (0, node_test_1.it)("reads its expression back after a restart", async () => {
        await harness_1.Database.set(new harness_1.Timer({
            name: "daily",
            kind: harness_1.TimerKind.cron,
            code: "$testMark[on:$timerData[cron]]",
            cron: "* * * * * *",
            timezone: "UTC",
            channelID: "chan-1",
        }));
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("on:* * * * * *"), 4000), `a restored cron saw ${harness_1.marks}`);
    });
    (0, node_test_1.it)("says nothing for an unnamed timer, which has no record to read", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[loose:<$timerData[name]>];50]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("loose:<>"), 3000), `it saw ${harness_1.marks}`);
    });
});
(0, node_test_1.describe)("$clearTimer", () => {
    (0, node_test_1.it)("cancels any kind under one name, telling them apart", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[t];1h;n]");
        await (0, harness_1.run)(harness, "$setInterval[$testMark[i];1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimer[interval;n]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[interval;n]"), "false");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;n]"), "true", "it took the wrong one");
    });
    (0, node_test_1.it)("cancels a cron, which the kind-specific ones cannot be asked for generically", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;daily]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimer[cron;daily]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[cron;daily]"), "false");
    });
    (0, node_test_1.it)("says no for a name nothing was scheduled under", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimer[timeout;never]"), "false");
    });
});
(0, node_test_1.describe)("$clearTimers", () => {
    (0, node_test_1.it)("cancels every match and counts them, leaving the rest alone", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;b]");
        await harness_1.Database.set(new harness_1.Timer({ name: "elsewhere", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "c2" }));
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimers[channelID;chan-1]"), "2");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;a]"), "false");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;b]"), "false");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;elsewhere]"), "true", "it reached past its filter");
    });
    (0, node_test_1.it)("takes the same pairs $findTimer does", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        await (0, harness_1.run)(harness, "$setInterval[x;1h;b]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimers[channelID;chan-1;kind;interval]"), "1");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;a]"), "true", "only the interval was asked for");
    });
    (0, node_test_1.it)("counts none when nothing matches, and refuses a pair without its value", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimers[name;missing]"), "0");
        strict_1.default.notEqual(await (0, harness_1.run)(harness, "$clearTimers[kind;timeout;channelID]"), "1", "an odd filter still cleared");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;n]"), "true", "and it took something anyway");
    });
});
(0, node_test_1.describe)("$timersCount", () => {
    (0, node_test_1.it)("counts what is stored, of one kind or of all of them", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        await (0, harness_1.run)(harness, "$setInterval[x;1h;b]");
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;c]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timersCount"), "3");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timersCount[interval]"), "1");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timersCount[cron]"), "1");
    });
    (0, node_test_1.it)("counts a paused timer, which is stored like any other", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timersCount[timeout]"), "1");
    });
    (0, node_test_1.it)("is zero when nothing is stored", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timersCount"), "0");
    });
});
(0, node_test_1.describe)("a context a native cloned", () => {
    (0, node_test_1.it)("still knows its timer, the way $scope and the await natives clone one", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[out=$timerData[name]|in=$scope[$timerData[name]]];60;probe]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length > 0, 2000), "it never ran");
        strict_1.default.equal(harness_1.marks[0], "out=probe|in=probe", "a cloned context left the run without its timer");
    });
});
(0, node_test_1.describe)("standing every timer down", () => {
    (0, node_test_1.it)("lets go of every name without touching what is stored", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]$setInterval[x;1h;b]$setCron[x;0 9 * * *;c]");
        const manager = harness.ext.timersManager;
        strict_1.default.equal(manager.isLive(harness_1.TimerKind.timeout, "a"), true, "nothing was armed to stand down");
        manager.standDown();
        for (const [kind, name] of [
            [harness_1.TimerKind.timeout, "a"],
            [harness_1.TimerKind.interval, "b"],
            [harness_1.TimerKind.cron, "c"],
        ]) {
            strict_1.default.equal(manager.isLive(kind, name), false, `the ${kind} is still live`);
            strict_1.default.ok(await harness_1.Database.get(kind, name), `the ${kind} lost its record, which is what wipe is for`);
        }
        strict_1.default.equal(harness.client.timeouts.size, 0);
        strict_1.default.equal(harness.client.intervals.size, 0);
    });
});
(0, node_test_1.describe)("a stored timer whose code will not compile", () => {
    // only something besides $setTimeout can store this, the outer command compiles first
    const broken = (name) => (0, harness_1.persist)(new harness_1.Timer({ name, kind: harness_1.TimerKind.timeout, code: "$if[", duration: 3_600_000 }), Date.now() + 3_600_000);
    (0, node_test_1.it)("is refused a new schedule, and left where it was", async () => {
        await broken("n");
        const before = (await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        strict_1.default.equal(await (0, harness_1.run)(harness, "$rescheduleTimer[timeout;n;30m]"), "false");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.timeout, "n")).fireAt, before.fireAt, "it was moved anyway");
    });
    (0, node_test_1.it)("is refused a release, and stays held", async () => {
        await broken("n");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]"), "true", "a hold asks nothing of the compiler");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[timeout;n]"), "false");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;n;paused]"), "true");
    });
    (0, node_test_1.it)("is refused a run by hand", async () => {
        await broken("n");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$executeTimer[timeout;n]"), "false");
    });
});
//# sourceMappingURL=control.test.js.map