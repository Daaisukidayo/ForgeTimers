"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./support/harness");
const types_1 = require("../types");
let harness;
(0, harness_1.useHarness)((booted) => (harness = booted), {
    options: { events: Object.values(types_1.TimerEvent), timeoutConfig: { maxOverdue: 1000 } },
    setup: (booted) => {
        for (const event of Object.values(types_1.TimerEvent)) {
            booted.ext.commands.add({ type: event, code: `$testMark[${event}:$timerData[name]:$timerData[kind]]` });
        }
        booted.ext.commands.add({ type: types_1.TimerEvent.timerDrop, code: "$testMark[why:$eventData[dropReason]]" });
    },
});
const QUIET = 250;
const droppedBecause = () => harness_1.marks.find((mark) => mark.startsWith("why:"))?.slice("why:".length);
/** A row already past due when the restore reaches it, but inside the maxOverdue this suite boots with */
const overdue = (name, code = "$testMark[ran]", extra = {}) => (0, harness_1.persist)(new harness_1.Timer({ name, kind: harness_1.TimerKind.timeout, code, duration: 3_600_000, channelID: "chan-1", ...extra }), Date.now() - 100);
(0, node_test_1.describe)("an event named as a plain string", () => {
    (0, node_test_1.it)("is listened to, and its command runs", async () => {
        harness.ext.commands.add({ type: "timerStart", code: "$testMark[from-a-string]" });
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[x];1h;plain]");
        strict_1.default.ok(await (0, harness_1.marked)("from-a-string"), "a command registered with a string never ran");
    });
});
(0, node_test_1.describe)("startup finishing", () => {
    (0, node_test_1.it)("counts what it kept and what it threw away", async () => {
        harness.ext.commands.add({
            type: types_1.TimerEvent.timersReady,
            code: "$testMark[ready:$eventData[restored]:$eventData[dropped]]",
        });
        // inside the 1000ms maxOverdue this suite boots with, so it is kept
        await overdue("kept");
        // an hour past it, so it is discarded instead
        await (0, harness_1.persist)(new harness_1.Timer({ name: "stale", kind: harness_1.TimerKind.timeout, code: "x", duration: 3_600_000, channelID: "chan-1" }), Date.now() - 3_600_000);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)("ready:1:1"), `wrong tally: ${harness_1.marks.filter((mark) => mark.startsWith("ready:"))}`);
    });
    (0, node_test_1.it)("still fires when there was nothing stored at all", async () => {
        harness.ext.commands.add({
            type: types_1.TimerEvent.timersReady,
            code: "$testMark[ready:$eventData[restored]:$eventData[dropped]]",
        });
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)("ready:0:0"), "a first boot has to reach the event too");
    });
});
(0, node_test_1.describe)("the options a timer carries", () => {
    (0, node_test_1.it)("reaches a listening command through $timerData", async () => {
        harness.ext.commands.add({ type: types_1.TimerEvent.timerStart, code: "$testMark[cfg:$timerData[config]]" });
        await (0, harness_1.run)(harness, "$setInterval[$testMark[x];1h;beat;false;;5]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => mark.startsWith("cfg:"))), "no event carried the options");
        const cfg = harness_1.marks.find((mark) => mark.startsWith("cfg:")).slice("cfg:".length);
        strict_1.default.deepEqual(JSON.parse(cfg), { persist: false, restoredTicksLimit: 5 });
    });
});
(0, node_test_1.describe)("holding a timer", () => {
    (0, node_test_1.it)("reports the hold and the release, each about its own timer", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;held]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[timeout;held]"), "true");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerPause}:held:timeout`), "pausing went unreported");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[timeout;held]"), "true");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerResume}:held:timeout`), "resuming went unreported");
    });
    (0, node_test_1.it)("reports nothing when there was nothing to hold or release", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;running]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$resumeTimer[timeout;running]"), "false", "it was never held");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$pauseTimer[timeout;missing]"), "false", "and this one does not exist");
        strict_1.default.ok(!harness_1.marks.some((mark) => mark.startsWith(types_1.TimerEvent.timerResume)), `it said ${harness_1.marks}`);
        strict_1.default.ok(!harness_1.marks.some((mark) => mark.startsWith(types_1.TimerEvent.timerPause)), `it said ${harness_1.marks}`);
    });
});
(0, node_test_1.describe)("$oldTimer and $newTimer", () => {
    (0, node_test_1.it)("show a tick moving the deadline on", async () => {
        harness.ext.commands.add({
            type: types_1.TimerEvent.timerFire,
            code: "$testMark[tick:$oldTimer[fireAt]:$newTimer[fireAt]]",
        });
        await (0, harness_1.run)(harness, "$setInterval[x;60;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => mark.startsWith("tick:"))), `nothing ticked: ${harness_1.marks}`);
        const [, before, after] = harness_1.marks.find((mark) => mark.startsWith("tick:")).split(":");
        strict_1.default.ok(Number(after) > Number(before), `the deadline did not move: ${before} then ${after}`);
        strict_1.default.equal(Number(after) - Number(before), 60, "it moved by something other than the tick length");
    });
    (0, node_test_1.it)("show a hold freezing the timer and a release starting it again", async () => {
        harness.ext.commands.add({
            type: types_1.TimerEvent.timerPause,
            code: "$testMark[held:$oldTimer[paused]:$newTimer[paused]]",
        });
        harness.ext.commands.add({
            type: types_1.TimerEvent.timerResume,
            code: "$testMark[freed:$oldTimer[paused]:$newTimer[paused]]",
        });
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        strict_1.default.ok(await (0, harness_1.marked)("held:false:true"), `the hold read wrong: ${harness_1.marks}`);
        await (0, harness_1.run)(harness, "$resumeTimer[timeout;n]");
        strict_1.default.ok(await (0, harness_1.marked)("freed:true:false"), `the release read wrong: ${harness_1.marks}`);
    });
    (0, node_test_1.it)("say nothing for an event that changed no timer", async () => {
        harness.ext.commands.add({
            type: types_1.TimerEvent.timerStart,
            code: "$testMark[fresh:<$oldTimer[name]>:$newTimer[name]]",
        });
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;born]");
        strict_1.default.ok(await (0, harness_1.marked)("fresh:<>:born"), `a timer with no before read wrong: ${harness_1.marks}`);
    });
});
(0, node_test_1.describe)("$timerData", () => {
    const readingWith = (code) => {
        harness.ext.commands.add({ type: types_1.TimerEvent.timerStart, code: `$testMark[read:${code}]` });
        return async () => {
            await (0, harness_1.run)(harness, "$setTimeout[$testMark[x];1h;reminder]");
            await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => mark.startsWith("read:")));
            return harness_1.marks.find((mark) => mark.startsWith("read:")).slice("read:".length);
        };
    };
    (0, node_test_1.it)("reads one property of the timer the event is about", async () => {
        strict_1.default.equal(await readingWith("$timerData[name]/$timerData[kind]/$timerData[channelID]")(), "reminder/timeout/chan-1");
    });
    (0, node_test_1.it)("hands back every property at once when asked for none", async () => {
        const whole = JSON.parse(await readingWith("$timerData")());
        strict_1.default.equal(whole.name, "reminder");
        strict_1.default.equal(whole.kind, "timeout");
        strict_1.default.ok(whole.fireAt > Date.now(), "the deadline has to be carried too");
    });
    (0, node_test_1.it)("keeps the timer off the environment entirely", async () => {
        harness.ext.commands.add({ type: types_1.TimerEvent.timerStart, code: "$testMark[env:<$env[timer]>]" });
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[x];1h;reminder]");
        // it rides the context, so a command can never reach its code or its variable snapshot through $env
        strict_1.default.ok(await (0, harness_1.marked)("env:<>"), `the timer leaked into the environment: ${harness_1.marks}`);
    });
    (0, node_test_1.it)("reads the same inside a timer's own code as it does in an event", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[self:$timerData[name]];60;mine]");
        strict_1.default.ok(await (0, harness_1.marked)("self:mine"), `a timer could not read itself: ${harness_1.marks}`);
    });
    (0, node_test_1.it)("keeps an event's own values out of the timer's names", async () => {
        harness.ext.commands.add({
            type: types_1.TimerEvent.timerDrop,
            code: "$testMark[both:$timerData[name]:$eventData[dropReason]]",
        });
        await (0, harness_1.persist)(new harness_1.Timer({ name: "expired", kind: harness_1.TimerKind.timeout, code: "x", duration: 1000, channelID: "chan-1" }), Date.now() - 60_000);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => mark.startsWith("both:expired:") && mark.includes("overdue"))), `the timer and the reason must both come through: ${harness_1.marks.filter((m) => m.startsWith("both:"))}`);
    });
    (0, node_test_1.it)("reads how late a restored timer was, alongside the timer itself", async () => {
        harness.ext.commands.add({
            type: types_1.TimerEvent.timerRestore,
            code: "$testMark[late:$timerData[name]:$eventData[overdueBy]]",
        });
        await overdue("tardy");
        await harness.ready();
        const seen = await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => /^late:tardy:\d+$/.test(mark)));
        strict_1.default.ok(seen, `no overdue reading came through: ${harness_1.marks.filter((mark) => mark.startsWith("late:"))}`);
    });
    (0, node_test_1.it)("reads empty in an event that is about no single timer", async () => {
        harness.ext.commands.add({ type: types_1.TimerEvent.timersReady, code: "$testMark[noTimer:<$timerData[name]>]" });
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)("noTimer:<>"), `timersReady carries no timer: ${harness_1.marks}`);
    });
});
(0, node_test_1.describe)("a timer being scheduled", () => {
    (0, node_test_1.it)("reports the timer it just took on", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;reminder]");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerStart}:reminder:timeout`));
    });
    (0, node_test_1.it)("reports an interval as an interval", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[ran];1h;beat]");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerStart}:beat:interval`));
    });
});
(0, node_test_1.describe)("a timer going off", () => {
    (0, node_test_1.it)("reports a timeout that ran", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];50;quick]");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerFire}:quick:timeout`));
    });
    (0, node_test_1.it)("reports every tick of an interval", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];50;beat]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.filter((m) => m.startsWith(types_1.TimerEvent.timerFire)).length >= 2));
    });
});
(0, node_test_1.describe)("a timer being cancelled", () => {
    (0, node_test_1.it)("reports one that was running", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;reminder]");
        await (0, harness_1.run)(harness, "$clearTimeout[reminder]");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerCancel}:reminder:timeout`));
    });
    (0, node_test_1.it)("reports each one $wipeTimers took down", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;first]$setInterval[$testMark[tick];1h;second]");
        harness_1.marks.length = 0;
        await (0, harness_1.run)(harness, "$wipeTimers");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerCancel}:first:timeout`));
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerCancel}:second:interval`));
    });
    (0, node_test_1.it)("says nothing when there was nothing to cancel", async () => {
        await (0, harness_1.run)(harness, "$clearTimeout[ghost]");
        strict_1.default.ok(!(await (0, harness_1.waitFor)(() => harness_1.marks.length > 0, QUIET)), `nothing was cancelled, yet: ${harness_1.marks}`);
    });
});
(0, node_test_1.describe)("a restart", () => {
    (0, node_test_1.it)("reports what it picked back up", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "survivor",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[ran]",
            duration: 3_600_000,
            channelID: "chan-1",
        }));
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerRestore}:survivor:timeout`));
    });
    (0, node_test_1.it)("reports a timeout that came due while it was down as fired", async () => {
        const due = new harness_1.Timer({
            name: "overdue",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[ran]",
            duration: 500,
            channelID: "chan-1",
        });
        await (0, harness_1.persist)(due, Date.now() - 100);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerRestore}:overdue:timeout`));
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerFire}:overdue:timeout`));
    });
    (0, node_test_1.it)("reports what it threw away, and why", async () => {
        const late = new harness_1.Timer({
            name: "expired",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[ran]",
            duration: 1000,
            channelID: "chan-1",
        });
        await (0, harness_1.persist)(late, Date.now() - 60_000);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerDrop}:expired:timeout`));
        strict_1.default.ok(harness_1.marks.some((mark) => mark.startsWith("why:") && mark.includes("overdue")), `the reason never reached the command: ${harness_1.marks}`);
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "expired"), null);
    });
});
// harness.reset() already puts timeoutConfig, pruneUnknownGuilds and channelError back before every test
(0, node_test_1.describe)("the reason a timer was dropped", () => {
    (0, node_test_1.it)("says nothing about a gone target, because that one fires instead of dropping", async () => {
        await overdue("orphaned");
        harness.channelError = (0, harness_1.apiError)(404, 10003, "Unknown Channel");
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerFire}:orphaned:timeout`), "a missing channel stopped the run");
        strict_1.default.equal(droppedBecause(), undefined, `it was dropped after all: ${droppedBecause()}`);
    });
    (0, node_test_1.it)("says the code no longer compiles", async () => {
        await overdue("broken", "$if[");
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerDrop}:broken:timeout`));
        strict_1.default.match(droppedBecause() ?? "", /compiles/);
    });
    (0, node_test_1.it)("says persist is off", async () => {
        harness.ext.options.timeoutConfig = { persist: false };
        await overdue("unwanted");
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerDrop}:unwanted:timeout`));
        strict_1.default.match(droppedBecause() ?? "", /persist is off/);
    });
    (0, node_test_1.it)("says the guild is not one this process is in", async () => {
        harness.ext.options.pruneUnknownGuilds = true;
        await overdue("elsewhere", "$testMark[ran]", { guildID: "g-gone" });
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerDrop}:elsewhere:timeout`));
        strict_1.default.match(droppedBecause() ?? "", /not one this process is in/);
    });
});
(0, node_test_1.describe)("a cancelled timer with no record behind it", () => {
    (0, node_test_1.before)(() => harness.ext.commands.add({ type: types_1.TimerEvent.timerCancel, code: "$testMark[left:$timerData[timeLeft]]" }));
    (0, node_test_1.it)("hands the command every property while the row is there", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;full]");
        await (0, harness_1.run)(harness, "$clearTimeout[full]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => /^left:\d+$/.test(mark))), `no timeLeft: ${harness_1.marks}`);
    });
    (0, node_test_1.it)("still reports one whose row is already gone, by name alone", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;orphan]");
        await harness_1.Database.delete(harness_1.TimerKind.timeout, "orphan");
        harness_1.marks.length = 0;
        await (0, harness_1.run)(harness, "$clearTimeout[orphan]");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerCancel}:orphan:timeout`), "the cancel went unreported");
        // nothing was stored, so there is no schedule left to report: only which name went away is true
        strict_1.default.ok(await (0, harness_1.marked)("left:0"), `it claimed to know a deadline it never read: ${harness_1.marks}`);
    });
});
//# sourceMappingURL=events.test.js.map