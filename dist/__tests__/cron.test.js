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
/** Every second, so a test can watch it come round without waiting on a wall clock */
const EVERY_SECOND = "* * * * * *";
/** A per-second cron whose last due time is `secondsAgo` behind, so it has that many to catch up on */
function overdueCron(name, secondsAgo) {
    const timer = new harness_1.Timer({
        name,
        kind: harness_1.TimerKind.cron,
        code: "$testMark[caught-up]",
        cron: EVERY_SECOND,
        channelID: "chan-1",
    });
    timer.fireAt = Date.now() - secondsAgo * 1000;
    return timer;
}
(0, node_test_1.describe)("$setCron", () => {
    (0, node_test_1.it)("stores the expression rather than a duration", async () => {
        await (0, harness_1.run)(harness, "$setCron[$testMark[ran];0 9 * * 1-5;daily]");
        const row = (await harness_1.Database.get(harness_1.TimerKind.cron, "daily"));
        strict_1.default.ok(row, "no row was written");
        strict_1.default.equal(row.cron, "0 9 * * 1-5");
        strict_1.default.equal(row.duration, 0, "a cron keeps no gap");
        strict_1.default.ok(row.fireAt > Date.now(), "its first run has to come from the expression");
    });
    (0, node_test_1.it)("reads the expression in the zone it was given", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;moscow;Europe/Moscow]");
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;utc;UTC]");
        const moscow = (await harness_1.Database.get(harness_1.TimerKind.cron, "moscow"));
        const utc = (await harness_1.Database.get(harness_1.TimerKind.cron, "utc"));
        strict_1.default.equal(moscow.timezone, "Europe/Moscow");
        strict_1.default.notEqual(moscow.fireAt, utc.fireAt, "09:00 in Moscow is not 09:00 in UTC");
    });
    (0, node_test_1.it)("falls back to the context's zone when the slot is left empty, not to a zone named nothing", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;blank;;false]");
        const row = await harness_1.Database.get(harness_1.TimerKind.cron, "blank");
        strict_1.default.ok(row, "leaving the zone out to reach a later argument threw the whole call away");
        strict_1.default.equal(row.timezone, "UTC", "an unnamed zone has to be written down, or a rehost moves the cron");
    });
    (0, node_test_1.it)("refuses an expression it cannot read, before anything is stored", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;not a cron;bad]");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.cron, "bad"), null, "a bad expression must not reach the database");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[cron;bad]"), "false");
    });
    (0, node_test_1.it)("runs on the expression, and keeps running", async () => {
        await (0, harness_1.run)(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`);
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length >= 2, 4000), `it ticked ${harness_1.marks.length} times`);
    });
    (0, node_test_1.it)("moves its own deadline on rather than drifting", async () => {
        await (0, harness_1.run)(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`);
        const first = (await harness_1.Database.get(harness_1.TimerKind.cron, "beat")).fireAt;
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length >= 1, 3000), "it never ticked");
        await (0, harness_1.waitFor)(async () => ((await harness_1.Database.get(harness_1.TimerKind.cron, "beat"))?.fireAt ?? 0) > first, 3000);
        const next = (await harness_1.Database.get(harness_1.TimerKind.cron, "beat")).fireAt;
        strict_1.default.ok(next > first, "the stored deadline never moved");
        strict_1.default.equal((next - first) % 1000, 0, "it landed off the expression's own beat");
    });
});
(0, node_test_1.describe)("reading a cron back", () => {
    (0, node_test_1.it)("hands back the expression and the zone it was given", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * 1-5;daily;Europe/Moscow]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[cron;daily;cron]"), "0 9 * * 1-5");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[cron;daily;timezone]"), "Europe/Moscow");
    });
    (0, node_test_1.it)("says nothing for a timeout, which keeps to a gap and has no expression", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;later]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;later;cron]"), "");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;later;timezone]"), "");
    });
});
(0, node_test_1.describe)("$clearCron", () => {
    (0, node_test_1.it)("stops it and forgets the row", async () => {
        await (0, harness_1.run)(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`);
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearCron[beat]"), "true");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.cron, "beat"), null);
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[cron;beat]"), "false");
        harness_1.marks.length = 0;
        strict_1.default.equal(await (0, harness_1.waitFor)(() => harness_1.marks.length > 0, 1500), false, "a cleared cron kept ticking");
    });
    (0, node_test_1.it)("says no for a name nothing was scheduled under", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearCron[never]"), "false");
    });
});
(0, node_test_1.describe)("a cron across a restart", () => {
    (0, node_test_1.it)("is picked back up and keeps its expression", async () => {
        await harness_1.Database.set(new harness_1.Timer({
            name: "daily",
            kind: harness_1.TimerKind.cron,
            code: "$testMark[ran]",
            cron: "0 9 * * *",
            timezone: "UTC",
            channelID: "chan-1",
        }));
        await harness.ready();
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[cron;daily]"), "true", "it was never re-armed");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.cron, "daily")).cron, "0 9 * * *");
    });
    (0, node_test_1.it)("is thrown away when its expression no longer reads, rather than throwing on its first tick", async () => {
        const stored = new harness_1.Timer({
            name: "rotten",
            kind: harness_1.TimerKind.cron,
            code: "$testMark[ran]",
            cron: "0 9 * * *",
            channelID: "chan-1",
        });
        // only a hand-edited row or a stricter parser gets here, and it used to reach advance()
        stored.cron = "garbage";
        await harness_1.Database.set(stored);
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.cron, "rotten"), null, "an unreadable cron must be dropped");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[cron;rotten]"), "false");
    });
    (0, node_test_1.it)("is thrown away when its expression is missing, rather than spinning on a zero gap", async () => {
        const hollow = new harness_1.Timer({ name: "hollow", kind: harness_1.TimerKind.timeout, duration: 0, channelID: "chan-1" });
        hollow.kind = harness_1.TimerKind.cron;
        hollow.id = harness_1.Timer.idOf(harness_1.TimerKind.cron, "hollow");
        await harness_1.Database.set(hollow);
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.cron, "hollow"), null, "a cron with no expression must be dropped");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[cron;hollow]"), "false");
    });
    (0, node_test_1.it)("replays nothing by default", async () => {
        await harness_1.Database.set(overdueCron("quiet", 10));
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "restoredTicksLimit defaults to 0");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[cron;quiet]"), "true", "but it still resumes");
    });
    (0, node_test_1.it)("replays what it slept through, up to the limit", async () => {
        harness.ext.options.cronConfig = { restoredTicksLimit: 3 };
        await harness_1.Database.set(overdueCron("busy", 10));
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length >= 3, 3000), `replayed ${harness_1.marks.length} of the 3 allowed`);
        strict_1.default.equal(harness_1.marks.length, 3, `it ran past its limit: ${harness_1.marks.length}`);
    });
    (0, node_test_1.it)("replays on the limit its own call set, over whatever cronConfig says", async () => {
        harness.ext.options.cronConfig = { restoredTicksLimit: 0 };
        const timer = overdueCron("busy", 10);
        timer.config = { restoredTicksLimit: 2 };
        await harness_1.Database.set(timer);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length >= 2, 3000), `the config's 0 won: replayed ${harness_1.marks.length}`);
        strict_1.default.equal(harness_1.marks.length, 2, `it ran past its own limit: ${harness_1.marks.length}`);
    });
    (0, node_test_1.it)("counts no further than the limit, however long it was down", async () => {
        // a per-second expression a day behind is 86400 occurrences: only the limit may be walked
        const day = overdueCron("ancient", 86_400);
        const started = Date.now();
        // one past the limit, which is how the caller is told there were more than it will run
        strict_1.default.equal(day.missedTicks(2), 3, "it counted past what anything would replay");
        strict_1.default.ok(Date.now() - started < 500, "counting took long enough to be walking the whole day");
    });
    (0, node_test_1.it)("comes back on its next occurrence after a pause, not on what was left of a gap", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;daily;UTC]");
        const due = (await harness_1.Database.get(harness_1.TimerKind.cron, "daily")).fireAt;
        await (0, harness_1.run)(harness, "$pauseTimer[cron;daily]");
        await (0, harness_1.run)(harness, "$resumeTimer[cron;daily]");
        const woken = (await harness_1.Database.get(harness_1.TimerKind.cron, "daily")).fireAt;
        strict_1.default.equal(new Date(woken).getUTCHours(), 9, `it woke at ${new Date(woken).toISOString()}, not at 09:00`);
        strict_1.default.equal(woken, due, "nothing moved on, so it should still be the same occurrence");
    });
    (0, node_test_1.it)("refuses a duration, since a gap is not a schedule it could keep", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;daily;UTC]");
        const due = (await harness_1.Database.get(harness_1.TimerKind.cron, "daily")).fireAt;
        strict_1.default.notEqual(await (0, harness_1.run)(harness, "$rescheduleTimer[cron;daily;30m]"), "true");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.cron, "daily")).fireAt, due, "its schedule was moved anyway");
    });
    (0, node_test_1.it)("takes a new expression, keeping everything it was scheduled with", async () => {
        await (0, harness_1.run)(harness, "$setCron[$testMark[ran];0 9 * * *;daily;UTC]");
        const before = (await harness_1.Database.get(harness_1.TimerKind.cron, "daily"));
        strict_1.default.equal(await (0, harness_1.run)(harness, "$rescheduleTimer[cron;daily;0 17 * * *]"), "true");
        const after = (await harness_1.Database.get(harness_1.TimerKind.cron, "daily"));
        strict_1.default.equal(after.cron, "0 17 * * *");
        strict_1.default.equal(new Date(after.fireAt).getUTCHours(), 17, "its next run did not come off the new expression");
        strict_1.default.equal(after.timezone, "UTC", "the zone it was given should survive being left out");
        strict_1.default.equal(after.code, before.code, "it was rebuilt instead of moved");
        strict_1.default.equal(after.channelID, before.channelID, "it lost the channel it answers in");
    });
    (0, node_test_1.it)("takes a new zone alongside the expression", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;daily;UTC]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$rescheduleTimer[cron;daily;0 9 * * *;Europe/Moscow]"), "true");
        const moved = (await harness_1.Database.get(harness_1.TimerKind.cron, "daily"));
        strict_1.default.equal(moved.timezone, "Europe/Moscow");
        strict_1.default.notEqual(new Date(moved.fireAt).getUTCHours(), 9, "09:00 in Moscow is not 09:00 in UTC");
    });
    (0, node_test_1.it)("refuses an expression it cannot read, leaving the old one alone", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;daily;UTC]");
        strict_1.default.notEqual(await (0, harness_1.run)(harness, "$rescheduleTimer[cron;daily;not a cron]"), "true");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.cron, "daily")).cron, "0 9 * * *");
    });
    (0, node_test_1.it)("refuses one the manager is handed directly, without standing the cron down first", async () => {
        await (0, harness_1.run)(harness, "$setCron[x;0 9 * * *;daily;UTC]");
        // the native checks too, so only a direct caller reaches this guard
        strict_1.default.equal(await harness.ext.timersManager.rescheduleCron("daily", "garbage"), false);
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.cron, "daily")).cron, "0 9 * * *");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[cron;daily]"), "true", "it was cancelled by a refused call");
    });
    (0, node_test_1.it)("can be paused and resumed like any other kind", async () => {
        await (0, harness_1.run)(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`);
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[cron;beat]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[cron;beat;paused]"), "true");
        harness_1.marks.length = 0;
        strict_1.default.equal(await (0, harness_1.waitFor)(() => harness_1.marks.length > 0, 1500), false, "a paused cron kept ticking");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[cron;beat]"), "true");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.length > 0, 4000), "it never ticked again");
    });
});
//# sourceMappingURL=cron.test.js.map