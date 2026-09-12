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
(0, harness_1.useHarness)((booted) => (harness = booted), {
    options: { events: Object.values(types_1.TimerEvent), timeoutConfig: { maxOverdue: 1000 } },
    setup: (booted) => {
        for (const event of Object.values(types_1.TimerEvent)) {
            booted.ext.commands.add({ type: event, code: `$testMark[${event}:$env[name]:$env[kind]]` });
        }
        booted.ext.commands.add({ type: types_1.TimerEvent.timerDrop, code: "$testMark[why:$env[reason]]" });
    },
});
const QUIET = 250;
const droppedBecause = () => harness_1.marks.find((mark) => mark.startsWith("why:"))?.slice("why:".length);
/** A row already past due when the restore reaches it, but inside the maxOverdue this suite boots with */
const overdue = (name, code = "$testMark[ran]", extra = {}) => (0, harness_1.persist)(new harness_1.Timer({ name, kind: harness_1.TimerKind.timeout, code, duration: 3_600_000, channelID: "chan-1", ...extra }), Date.now() - 100);
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
(0, node_test_1.describe)("the reason a timer was dropped", () => {
    const timeoutConfig = harness?.ext.options.timeoutConfig;
    (0, node_test_1.beforeEach)(() => {
        harness.ext.options.timeoutConfig = timeoutConfig ?? { maxOverdue: 1000 };
        harness.ext.options.pruneUnknownGuilds = false;
        harness.channelError = undefined;
    });
    (0, node_test_1.after)(() => {
        harness.ext.options.timeoutConfig = timeoutConfig ?? { maxOverdue: 1000 };
        harness.ext.options.pruneUnknownGuilds = false;
        harness.channelError = undefined;
    });
    (0, node_test_1.it)("says the target is gone", async () => {
        await overdue("orphaned");
        harness.channelError = (0, harness_1.apiError)(404, 10003, "Unknown Channel");
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerDrop}:orphaned:timeout`));
        strict_1.default.match(droppedBecause() ?? "", /target is gone/);
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
    (0, node_test_1.it)("says the guild is out of sight", async () => {
        harness.ext.options.pruneUnknownGuilds = true;
        await overdue("elsewhere", "$testMark[ran]", { guildID: "g-gone" });
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerDrop}:elsewhere:timeout`));
        strict_1.default.match(droppedBecause() ?? "", /not visible/);
    });
});
(0, node_test_1.describe)("a cancelled timer with no record behind it", () => {
    (0, node_test_1.before)(() => harness.ext.commands.add({ type: types_1.TimerEvent.timerCancel, code: "$testMark[left:$env[timeLeft]]" }));
    (0, node_test_1.it)("hands the command every property while the row is there", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;full]");
        await (0, harness_1.run)(harness, "$clearTimeout[full]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => /^left:\d+$/.test(mark))), `no timeLeft: ${harness_1.marks}`);
    });
    (0, node_test_1.it)("still reports one whose row is already gone, with nothing but its name", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];1h;orphan]");
        await harness_1.Database.delete(harness_1.TimerKind.timeout, "orphan");
        harness_1.marks.length = 0;
        await (0, harness_1.run)(harness, "$clearTimeout[orphan]");
        strict_1.default.ok(await (0, harness_1.marked)(`${types_1.TimerEvent.timerCancel}:orphan:timeout`), "the cancel went unreported");
        strict_1.default.ok(await (0, harness_1.marked)("left:"), `the payload carried more than the name: ${harness_1.marks}`);
    });
});
//# sourceMappingURL=events.test.js.map