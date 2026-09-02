"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
let harness;
(0, node_test_1.before)(async () => (harness = await (0, harness_1.boot)()));
(0, node_test_1.beforeEach)(async () => {
    harness.disarm();
    await harness_1.Database.wipe();
    harness_1.marks.length = 0;
});
(0, node_test_1.after)(async () => {
    harness.disarm();
    await harness.cleanup();
});
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
        strict_1.default.equal(row.hostID, "user-9");
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
    (0, node_test_1.it)("refuses a zero duration", async () => {
        await (0, harness_1.run)(harness, "$setInterval[x;;n]");
        strict_1.default.equal((await harness_1.Database.getAll()).length, 0);
        strict_1.default.equal(harness.client.intervals.size, 0, "a 0ms interval would be a busy loop");
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
        strict_1.default.deepEqual(await manager.stop(harness_1.TimerKind.timeout, "both"), [true, true]);
        await (0, harness_1.persist)(new harness_1.Timer({ name: "stored", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "chan-1" }), Date.now() + 60_000);
        strict_1.default.deepEqual(await manager.stop(harness_1.TimerKind.timeout, "stored"), [false, true]);
        strict_1.default.deepEqual(await manager.stop(harness_1.TimerKind.timeout, "neither"), [false, false]);
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
});
//# sourceMappingURL=natives.test.js.map