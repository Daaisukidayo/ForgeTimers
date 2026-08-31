"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const discord_js_1 = require("discord.js");
const harness_1 = require("./harness");
const snapshotVars_1 = require("../functions/snapshotVars");
let harness;
(0, node_test_1.before)(async () => {
    harness = await (0, harness_1.boot)();
    harness.channels.set("chan-1", { id: "chan-1" });
});
(0, node_test_1.beforeEach)(async () => {
    harness.disarm();
    await harness_1.Database.wipe();
    harness_1.marks.length = 0;
    harness.channelError = undefined;
    harness.guilds.clear();
    harness.commands = [];
    harness.fetches.channels = 0;
    configure({}, {});
});
(0, node_test_1.after)(async () => {
    harness.disarm();
    await harness.cleanup();
});
function configure(timeoutConfig, intervalConfig) {
    Object.assign(harness.ext.options, { timeoutConfig, intervalConfig, pruneUnknownGuilds: false });
}
const stored = (kind, duration, dueIn, name = "n") => (0, harness_1.persist)(new harness_1.Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" }), Date.now() + dueIn);
const apiError = (status, code, message) => new discord_js_1.DiscordAPIError({ message, code }, code, status, "GET", "/channels/x", {});
(0, node_test_1.describe)("restoring timeouts", () => {
    (0, node_test_1.it)("re-arms one that is not due yet and keeps its record", async () => {
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "it is not due, it must not fire");
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
    });
    (0, node_test_1.it)("fires one that came due while the app was down, then forgets it", async () => {
        await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["n"]);
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null, "a fired timeout is spent");
    });
    (0, node_test_1.it)("discards one that is later than maxOverdue allows, without running it", async () => {
        configure({ maxOverdue: 10_000 }, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "too late to be worth running");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("measures lateness against the due time, not the downtime", async () => {
        configure({ maxOverdue: 10_000 }, {});
        await stored(harness_1.TimerKind.timeout, 90 * 24 * 60 * 60 * 1000, 60_000);
        await harness.ready();
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "a timer due later is never overdue");
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
    (0, node_test_1.it)("drops stored timers when persist is off", async () => {
        configure({ persist: false }, {});
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000);
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
        strict_1.default.equal(harness.client.timeouts.has("n"), false);
    });
});
(0, node_test_1.describe)("restoring intervals", () => {
    (0, node_test_1.it)("replays nothing by default", async () => {
        await stored(harness_1.TimerKind.interval, 1000, -3500);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "restoredTicksLimit defaults to 0");
        strict_1.default.equal(harness.client.intervals.has("n"), true, "but the schedule still resumes");
    });
    (0, node_test_1.it)("replays every missed tick at -1", async () => {
        configure({}, { restoredTicksLimit: -1 });
        await stored(harness_1.TimerKind.interval, 1000, -3500);
        await harness.ready();
        strict_1.default.equal(harness_1.marks.length, 4, `expected 4 missed ticks, replayed ${harness_1.marks.length}`);
        strict_1.default.equal(harness.client.intervals.has("n"), true);
    });
    (0, node_test_1.it)("replays at most the configured number", async () => {
        configure({}, { restoredTicksLimit: 2 });
        await stored(harness_1.TimerKind.interval, 1000, -3500);
        await harness.ready();
        strict_1.default.equal(harness_1.marks.length, 2);
    });
    (0, node_test_1.it)("resumes on the time left rather than a whole fresh tick", async () => {
        await stored(harness_1.TimerKind.interval, 10_000, 200);
        await harness.ready();
        await new Promise((r) => setTimeout(r, 450));
        strict_1.default.deepEqual(harness_1.marks, ["n"], "the tick was 200ms away, not 10s");
    });
    (0, node_test_1.it)("skips a stale tick past maxOverdue and carries on", async () => {
        configure({}, { maxOverdue: 1000, restoredTicksLimit: -1 });
        await stored(harness_1.TimerKind.interval, 1000, -60_000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "the stale tick is skipped, not replayed");
        strict_1.default.equal(harness.client.intervals.has("n"), true);
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "n");
        strict_1.default.ok(row.fireAt > Date.now(), "the schedule was moved forward");
    });
});
(0, node_test_1.describe)("when a timer cannot be rebuilt", () => {
    (0, node_test_1.it)("keeps the record when discord is merely unreachable", async () => {
        for (const err of [
            apiError(500, 0, "Internal Server Error"),
            apiError(429, 0, "You are being rate limited"),
            apiError(403, 50001, "Missing Access"),
            new Error("getaddrinfo ENOTFOUND discord.com"),
        ]) {
            await harness_1.Database.wipe();
            await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
            harness.channelError = err;
            await harness.ready();
            strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), `a timer was destroyed by a transient failure: ${err.message}`);
            strict_1.default.deepEqual(harness_1.marks, []);
        }
    });
    (0, node_test_1.it)("drops the record once a due timer finds its channel gone", async () => {
        await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
        harness.channelError = apiError(404, 10003, "Unknown Channel");
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("drops the record when the code no longer compiles", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$if[", duration: 1000, channelID: "chan-1" }), Date.now() + 60_000);
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("stops an interval whose target turns out to be gone", async () => {
        await stored(harness_1.TimerKind.interval, 60, -1000);
        harness.channelError = apiError(404, 10003, "Unknown Channel");
        await harness.ready();
        await new Promise((r) => setTimeout(r, 300));
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.interval, "n"), null);
        strict_1.default.equal(harness.client.intervals.has("n"), false);
    });
});
(0, node_test_1.describe)("rebuilding lazily", () => {
    (0, node_test_1.it)("touches nothing at boot for a timer that is not due", async () => {
        for (let i = 0; i < 20; i++)
            await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000, `t${i}`);
        harness.fetches.channels = 0;
        await harness.ready();
        strict_1.default.equal(harness.fetches.channels, 0, "a boot must not cost a request per stored timer");
        strict_1.default.equal(harness.client.timeouts.size, 20, "they are still armed");
        strict_1.default.equal((await harness_1.Database.getAll()).length, 20);
    });
    (0, node_test_1.it)("keeps a distant timer whose channel is already gone", async () => {
        await stored(harness_1.TimerKind.timeout, 3_600_000, 60_000);
        harness.channelError = apiError(404, 10003, "Unknown Channel");
        await harness.ready();
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "it is not due, so nothing was asked of discord yet");
    });
    (0, node_test_1.it)("resolves the target once, not on every tick", async () => {
        await stored(harness_1.TimerKind.interval, 60, -1000);
        harness.fetches.channels = 0;
        await harness.ready();
        await new Promise((r) => setTimeout(r, 350));
        harness.disarm();
        strict_1.default.ok(harness_1.marks.length >= 3, `only ${harness_1.marks.length} ticks ran`);
        strict_1.default.equal(harness.fetches.channels, 1, `resolved ${harness.fetches.channels} times`);
    });
});
(0, node_test_1.describe)("timers with no channel", () => {
    (0, node_test_1.it)("restores and runs one scheduled outside of a channel", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[ready]", duration: 1000 }), Date.now() - 1000);
        harness.fetches.channels = 0;
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["ready"], "a clientReady timer must survive a restart like any other");
        strict_1.default.equal(harness.fetches.channels, 0, "there is no channel to ask for");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("keeps ticking an interval that has no channel", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.interval, code: "$testMark[tick]", duration: 60 }), Date.now() - 1000);
        await harness.ready();
        await new Promise((r) => setTimeout(r, 300));
        harness.disarm();
        strict_1.default.ok(harness_1.marks.length >= 3, `only ${harness_1.marks.length} ticks ran`);
        strict_1.default.equal(harness.fetches.channels, 0);
    });
    (0, node_test_1.it)("is not affected by a channel outage", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[ready]", duration: 1000 }), Date.now() - 1000);
        harness.channelError = apiError(500, 0, "Internal Server Error");
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["ready"]);
    });
});
(0, node_test_1.describe)("the command a timer came from", () => {
    (0, node_test_1.it)("is handed back to the restored run", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/remind.js" } }];
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[$commandName]", duration: 1000,
            channelID: "chan-1", path: "/commands/remind.js", commandName: "remind" }), Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["remind"], "$commandName must read the same command it did when scheduled");
    });
    (0, node_test_1.it)("is matched by name when the file has moved", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/moved.js" } }];
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[$commandName]", duration: 1000,
            channelID: "chan-1", path: "/commands/remind.js", commandName: "remind" }), Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["remind"]);
    });
    (0, node_test_1.it)("is left null when the command is gone", async () => {
        harness.commands = [];
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[gone:$commandName]", duration: 1000,
            channelID: "chan-1", path: "/commands/removed.js", commandName: "removed" }), Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["gone:"], "a missing command must not stop the timer from running");
    });
});
(0, node_test_1.describe)("the stored schema", () => {
    (0, node_test_1.it)("leaves a row written by a newer build alone", async () => {
        const timer = await stored(harness_1.TimerKind.timeout, 3_600_000, -60_000);
        timer.version = harness_1.Timer.SCHEMA_VERSION + 1;
        await harness_1.Database.set(timer);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [], "it must not be read with the wrong rules");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "nor thrown away");
    });
    (0, node_test_1.it)("reads a row from before the schema as plain json", async () => {
        const legacy = { $forge: "date", value: "not a date" };
        const timer = new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[$env[cfg]]",
            duration: 1000, channelID: "chan-1" });
        timer.version = null;
        timer.vars = { keywords: {}, environment: { cfg: legacy }, localFunctions: {} };
        await (0, harness_1.persist)(timer, Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [JSON.stringify(legacy, null, 4)], "a row written before the envelope existed must not be read as one");
    });
    (0, node_test_1.it)("carries a date through the database and back", async () => {
        const when = new Date("2026-08-27T12:00:00.000Z");
        const timer = new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[$env[when]]",
            duration: 1000, channelID: "chan-1",
            vars: (0, snapshotVars_1.snapshotVars)({ keywords: {}, environment: { when }, localFunctions: {} }, "test") });
        await (0, harness_1.persist)(timer, Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, [JSON.stringify(when)], "a Date renders quoted, a plain iso string renders bare and a raw envelope renders as an object");
    });
});
(0, node_test_1.describe)("ownership across processes", () => {
    (0, node_test_1.it)("leaves a timer whose guild this process cannot see", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[n]", duration: 1000,
            channelID: "chan-1", guildID: "guild-elsewhere" }), Date.now() + 60_000);
        await harness.ready();
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "another shard's timer is not ours to delete");
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "nor ours to run");
    });
    (0, node_test_1.it)("prunes it only when asked to", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[n]", duration: 1000,
            channelID: "chan-1", guildID: "guild-elsewhere" }), Date.now() + 60_000);
        Object.assign(harness.ext.options, { pruneUnknownGuilds: true });
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("restores a timer whose guild this process can see", async () => {
        harness.guilds.add("guild-mine");
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[n]", duration: 1000,
            channelID: "chan-1", guildID: "guild-mine" }), Date.now() + 60_000);
        await harness.ready();
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
});
//# sourceMappingURL=restore.test.js.map