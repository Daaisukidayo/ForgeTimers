"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./support/harness");
const timer_1 = require("../properties/timer");
let harness;
(0, harness_1.useHarness)((booted) => (harness = booted));
(0, node_test_1.describe)("$setTimeout", () => {
    (0, node_test_1.it)("persists a named timeout and arms it", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$sendMessage[now];1h;reminder]");
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder");
        strict_1.default.ok(row, "no row was written");
        strict_1.default.equal(row.code, "$sendMessage[now]", "the raw code is what gets replayed");
        strict_1.default.equal(row.duration, 3_600_000);
        strict_1.default.equal(row.channelID, "chan-1");
        strict_1.default.equal(harness.client.timeouts.has("reminder"), true);
    });
    (0, node_test_1.it)("takes a negative duration", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[now];-5000;n]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("now"), 2000), "overriding the native must not take the call away");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null, "and a spent timeout still gives up its record");
    });
    (0, node_test_1.it)("records where and by whom it was scheduled", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]", {
            id: "msg-1",
            channel: { id: "chan-9" },
            guild: { id: "guild-9" },
            author: { id: "user-9" },
        });
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "n");
        strict_1.default.equal(row.channelID, "chan-9");
        strict_1.default.equal(row.guildID, "guild-9");
        strict_1.default.equal(row.authorID, "user-9");
    });
    (0, node_test_1.it)("records a slash command, which has a channel and a user but no message", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[fired:$authorID];120;n]", {
            channel: { id: "chan-9" },
            user: { id: "user-9" },
            guild: { id: "guild-9" },
        });
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "n");
        strict_1.default.equal(row.channelID, "chan-9");
        strict_1.default.equal(row.authorID, "user-9");
        strict_1.default.equal(row.messageID, null, "there is no message for a restart to come back to");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("fired:user-9"), 2000), "it never ran");
    });
    (0, node_test_1.it)("leaves an unnamed timeout out of the database", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1s]");
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0);
    });
    (0, node_test_1.it)("survives a duration past node's 32-bit cap", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[distant];90d;distant]");
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "distant");
        strict_1.default.equal(row.duration, 90 * 24 * 60 * 60 * 1000);
        strict_1.default.ok(row.timeLeft() > 89 * 24 * 60 * 60 * 1000, "it must not be due already");
        await new Promise((r) => setTimeout(r, 120));
        strict_1.default.deepEqual(harness_1.marks, [], "a 90 day timeout ran immediately");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "distant"), "and then deleted itself");
    });
    (0, node_test_1.it)("replaces a timer reused under the same name", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[first;1h;n]");
        await (0, harness_1.run)(harness, "$setTimeout[second;2h;n]");
        strict_1.default.equal((await harness_1.Database.getAll()).length, 1);
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "n");
        strict_1.default.equal(row.code, "second");
        strict_1.default.equal(row.duration, 7_200_000);
    });
    (0, node_test_1.it)("refuses a name too long for the key column", async () => {
        await (0, harness_1.run)(harness, `$setTimeout[x;1h;${"x".repeat(300)}]`);
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0, "an oversized name must not reach the database");
    });
    (0, node_test_1.it)("persists a named timer scheduled outside of a channel", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]", {});
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "n");
        strict_1.default.ok(row, "a clientReady command has no channel and must still be able to schedule");
        strict_1.default.equal(row.channelID, null);
        strict_1.default.equal(row.guildID, null);
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
    (0, node_test_1.it)("persists a named interval scheduled outside of a channel", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;5m;n]", {});
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "n");
        strict_1.default.ok(row);
        strict_1.default.equal(row.channelID, null);
        strict_1.default.equal(harness.client.intervals.has("n"), true);
    });
    (0, node_test_1.it)("still allows an unnamed timer without a channel", async () => {
        const result = await (0, harness_1.run)(harness, "$setTimeout[x;1s]", { channel: null });
        strict_1.default.notEqual(result, null, "an unnamed timer needs no channel, it is never restored");
    });
});
(0, node_test_1.describe)("$setInterval", () => {
    (0, node_test_1.it)("persists a named interval and arms it", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$sendMessage[tick];5m;pulse]");
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "pulse");
        strict_1.default.ok(row);
        strict_1.default.equal(row.kind, harness_1.TimerKind.interval);
        strict_1.default.equal(row.duration, 300_000);
        strict_1.default.equal(harness.client.intervals.has("pulse"), true);
    });
    (0, node_test_1.it)("leaves an unnamed interval out of the database, the way an unnamed timeout is left out", async () => {
        // an unnamed interval is registered nowhere, a real one would outlive the test with nothing to stop it
        const schedule = require("../functions/schedule");
        const real = schedule.setLongInterval;
        const armed = [];
        schedule.setLongInterval = (duration) => void armed.push(duration);
        try {
            await (0, harness_1.run)(harness, "$setInterval[x;1h]");
        }
        finally {
            schedule.setLongInterval = real;
        }
        strict_1.default.deepEqual(armed, [3_600_000], "the unnamed branch never ran");
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0, "an unnamed interval must not be persisted");
        strict_1.default.equal(harness.client.intervals.size, 0, "there is no name to register it under");
    });
    (0, node_test_1.it)("refuses a name too long for the key column", async () => {
        await (0, harness_1.run)(harness, `$setInterval[x;1h;${"x".repeat(300)}]`);
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0, "an oversized name must not reach the database");
    });
    (0, node_test_1.it)("takes a zero duration, which forgescript runs on the event loop", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];;n]");
        const ticked = await (0, harness_1.waitFor)(() => harness_1.marks.filter((mark) => mark === "tick").length >= 2, 2000);
        harness.disarm();
        strict_1.default.ok(ticked, "overriding the native must not take the call away");
        strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.interval, "n")).duration, 0, "it is stored as it was scheduled");
    });
});
(0, node_test_1.describe)("$clearTimeout and $clearInterval", () => {
    (0, node_test_1.it)("cancels a timeout and forgets it", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        const result = await (0, harness_1.run)(harness, "$clearTimeout[n]");
        strict_1.default.equal(result, "true");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
        strict_1.default.equal(harness.client.timeouts.has("n"), false);
    });
    (0, node_test_1.it)("cancels an interval and forgets it", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;5m;n]");
        await (0, harness_1.run)(harness, "$clearInterval[n]");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.interval, "n"), null);
        strict_1.default.equal(harness.client.intervals.has("n"), false);
    });
    (0, node_test_1.it)("reports false for a timer that was never running", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimeout[never]"), "false");
    });
    (0, node_test_1.it)("reports true for a timer that is stored but not running here", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "elsewhere", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "chan-1" }), Date.now() + 60_000);
        strict_1.default.equal(harness.client.timeouts.has("elsewhere"), false);
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimeout[elsewhere]"), "true");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "elsewhere"), null);
    });
    (0, node_test_1.it)("tells running apart from stored", async () => {
        const manager = harness.ext.timersManager;
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;both]");
        strict_1.default.deepEqual(await manager.stop(harness_1.TimerKind.timeout, "both"), { cleared: true, forgotten: true });
        await (0, harness_1.persist)(new harness_1.Timer({ name: "stored", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "chan-1" }), Date.now() + 60_000);
        strict_1.default.deepEqual(await manager.stop(harness_1.TimerKind.timeout, "stored"), { cleared: false, forgotten: true });
        strict_1.default.deepEqual(await manager.stop(harness_1.TimerKind.timeout, "neither"), { cleared: false, forgotten: false });
    });
});
(0, node_test_1.describe)("a name used by both kinds at once", () => {
    (0, node_test_1.it)("cancels only the kind that was asked for", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[t];1h;n]$setInterval[$testMark[i];1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimeout[n]"), "true");
        strict_1.default.equal(harness.client.timeouts.has("n"), false);
        strict_1.default.equal(harness.client.intervals.has("n"), true, "the interval went down with the timeout");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.interval, "n"), "the interval's row went with it");
    });
    (0, node_test_1.it)("wipes both", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[t];1h;n]$setInterval[$testMark[i];1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$wipeTimers"), "2");
        strict_1.default.equal(harness.client.timeouts.size, 0);
        strict_1.default.equal(harness.client.intervals.size, 0);
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0);
    });
    (0, node_test_1.it)("stands a cron down too, rather than leaving it armed", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[t];1h;n]$setCron[$testMark[c];0 9 * * *;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$wipeTimers"), "2", "the cron went uncounted");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[cron;n]"), "false", "the cron was left running");
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0);
    });
});
(0, node_test_1.describe)("reading timers back", () => {
    (0, node_test_1.it)("returns a single property", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;n;duration]"), "3600000");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;n;kind]"), "timeout");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;n;channelID]"), "chan-1");
    });
    (0, node_test_1.it)("returns the whole timer as json without a property", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        const parsed = JSON.parse((await (0, harness_1.run)(harness, "$getTimer[timeout;n]")));
        strict_1.default.equal(parsed.id, "timeout:n");
        strict_1.default.equal(parsed.duration, 3_600_000);
    });
    (0, node_test_1.it)("carries the documented properties, and nothing kept for the extension itself", async () => {
        await (0, harness_1.run)(harness, "$let[note;kept]$setTimeout[$get[note];1h;n]");
        const parsed = JSON.parse((await (0, harness_1.run)(harness, "$getTimer[timeout;n]")));
        const listed = JSON.parse((await (0, harness_1.run)(harness, "$getAllTimers")))[0];
        const documented = Object.values(timer_1.TimerProperty).sort();
        strict_1.default.deepEqual(Object.keys(parsed).sort(), documented, "$getTimer drifted from the property list");
        strict_1.default.deepEqual(Object.keys(listed).sort(), documented, "$getAllTimers drifted from it too");
        strict_1.default.ok(parsed.timeLeft > 0, "timeLeft is a property, so json has to carry it");
        strict_1.default.deepEqual(parsed.args, [], "args reads as a list, not as null");
    });
    (0, node_test_1.it)("returns nothing for a timer that does not exist", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;missing]"), "");
    });
    (0, node_test_1.it)("lists every timer, and filters by kind", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        await (0, harness_1.run)(harness, "$setInterval[x;5m;b]");
        strict_1.default.equal(JSON.parse((await (0, harness_1.run)(harness, "$getAllTimers"))).length, 2);
        strict_1.default.equal(JSON.parse((await (0, harness_1.run)(harness, "$getAllTimers[interval]"))).length, 1);
        strict_1.default.equal(JSON.parse((await (0, harness_1.run)(harness, "$getAllTimers[timeout]")))[0].name, "a");
    });
    (0, node_test_1.it)("wipes everything and reports what was running", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        await (0, harness_1.run)(harness, "$setInterval[x;5m;b]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$wipeTimers"), "2");
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0);
        strict_1.default.equal(harness.client.timeouts.size, 0);
        strict_1.default.equal(harness.client.intervals.size, 0);
    });
    (0, node_test_1.it)("returns one property of every timer as a list", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;5m;a]");
        await (0, harness_1.run)(harness, "$setInterval[x;5m;b]");
        const listed = JSON.parse((await (0, harness_1.run)(harness, "$getAllTimers[interval;name]")));
        strict_1.default.deepEqual(listed.sort(), ["a", "b"], "a property without a separator stays a list");
    });
    (0, node_test_1.it)("joins that list only when given a separator", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;5m;a]");
        await (0, harness_1.run)(harness, "$setInterval[x;5m;b]");
        const joined = `${await (0, harness_1.run)(harness, "$getAllTimers[interval;name;|]")}`;
        strict_1.default.deepEqual(joined.split("|").sort(), ["a", "b"]);
    });
    (0, node_test_1.it)("keeps a json property readable when joining", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a;false]");
        const joined = `${await (0, harness_1.run)(harness, "$getAllTimers[timeout;config;|]")}`;
        strict_1.default.equal(joined, '{"persist":false}', "an object must not join as [object Object]");
    });
});
(0, node_test_1.describe)("$timerRunning", () => {
    (0, node_test_1.it)("sees a running timer, and only of the kind asked for", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[timeout;a]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[interval;a]"), "false", "the name is per kind");
    });
    (0, node_test_1.it)("says no once it has been cleared", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;5m;beat]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[interval;beat]"), "true");
        await (0, harness_1.run)(harness, "$clearInterval[beat]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[interval;beat]"), "false");
    });
    (0, node_test_1.it)("says no for a name nothing was ever scheduled under", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[timeout;never]"), "false");
    });
    (0, node_test_1.it)("answers from the live map, not from the database", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "stored", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "c" }));
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "stored"), "the row is there");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[timeout;stored]"), "false", "but nothing is armed under it");
    });
    (0, node_test_1.it)("says yes to a timer asking about itself, however that run was started", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[live:$timerRunning[timeout;live]];50;live]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("live:true"), 3000), `a fired timeout saw ${harness_1.marks}`);
        harness_1.marks.length = 0;
        // a restored overdue run holds its name with nothing scheduled, and used to read as false
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "late",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[late:$timerRunning[timeout;late]]",
            duration: 1000,
            channelID: "chan-1",
        }), Date.now() - 100);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("late:true"), 3000), `a restored run saw ${harness_1.marks}`);
    });
});
(0, node_test_1.describe)("$timerExists", () => {
    (0, node_test_1.it)("counts a record nothing re-armed, which the other says no to", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "stored", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "c" }));
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;stored]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[timeout;stored]"), "false", "the two are not the same question");
    });
    (0, node_test_1.it)("says no to one armed with no record, which is how a database outage leaves it", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        await harness_1.Database.delete(harness_1.TimerKind.timeout, "n");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[timeout;n]"), "true", "it is still armed");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;n]"), "false", "but the two answer for one place each");
    });
    (0, node_test_1.it)("counts a paused timer, which is exactly the one the other says no to", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
        await (0, harness_1.run)(harness, "$pauseTimer[timeout;n]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;n]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerRunning[timeout;n]"), "false");
    });
    (0, node_test_1.it)("says no once the record is gone, and only for the kind asked for", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[x;1h;a]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;a]"), "true");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[interval;a]"), "false", "the name is per kind");
        await (0, harness_1.run)(harness, "$clearTimeout[a]");
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;a]"), "false");
    });
    (0, node_test_1.it)("says no for a name nothing was ever scheduled under", async () => {
        strict_1.default.equal(await (0, harness_1.run)(harness, "$timerExists[timeout;never]"), "false");
    });
});
(0, node_test_1.describe)("$setCron", () => {
    (0, node_test_1.it)("refuses a name too long for the key column", async () => {
        await (0, harness_1.run)(harness, `$setCron[x;0 9 * * *;${"x".repeat(300)}]`);
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0, "an oversized name must not reach the database");
    });
});
//# sourceMappingURL=natives.test.js.map