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
const stored = (kind, duration, dueIn, name = "n") => (0, harness_1.persist)(new harness_1.Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" }), Date.now() + dueIn);
(0, node_test_1.describe)("when a timer cannot be rebuilt", () => {
    (0, node_test_1.it)("keeps the record when discord is merely unreachable", async () => {
        for (const err of [
            (0, harness_1.apiError)(500, 0, "Internal Server Error"),
            (0, harness_1.apiError)(429, 0, "You are being rate limited"),
            (0, harness_1.apiError)(403, 50001, "Missing Access"),
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
        harness.channelError = (0, harness_1.apiError)(404, 10003, "Unknown Channel");
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
        harness.channelError = (0, harness_1.apiError)(404, 10003, "Unknown Channel");
        await harness.ready();
        await (0, harness_1.waitFor)(async () => (await harness_1.Database.get(harness_1.TimerKind.interval, "n")) === null);
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
        harness.channelError = (0, harness_1.apiError)(404, 10003, "Unknown Channel");
        await harness.ready();
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "it is not due, so nothing was asked of discord yet");
    });
    (0, node_test_1.it)("resolves the target once, not on every tick", async () => {
        await stored(harness_1.TimerKind.interval, 60, -1000);
        harness.fetches.channels = 0;
        await harness.ready();
        const reached = await (0, harness_1.waitFor)(() => harness_1.marks.length >= 3);
        harness.disarm();
        strict_1.default.ok(reached, `only ${harness_1.marks.length} ticks ran`);
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
        const reached = await (0, harness_1.waitFor)(() => harness_1.marks.length >= 3);
        harness.disarm();
        strict_1.default.ok(reached, `only ${harness_1.marks.length} ticks ran`);
        strict_1.default.equal(harness.fetches.channels, 0);
    });
    (0, node_test_1.it)("is not affected by a channel outage", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, code: "$testMark[ready]", duration: 1000 }), Date.now() - 1000);
        harness.channelError = (0, harness_1.apiError)(500, 0, "Internal Server Error");
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["ready"]);
    });
});
(0, node_test_1.describe)("the command a timer came from", () => {
    (0, node_test_1.it)("is looked up once, not on every tick", async () => {
        harness.commands = [{ data: { name: "reminder", path: "/commands/reminder.js" } }];
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "beat",
            kind: harness_1.TimerKind.interval,
            code: "$testMark[tick]",
            duration: 50,
            channelID: "chan-1",
            path: "/commands/reminder.js",
        }), Date.now() + 50);
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.filter((mark) => mark === "tick").length >= 3), "the interval never ticked");
        strict_1.default.equal(harness.fetches.commands, 1, `scanned the command list ${harness.fetches.commands} times`);
    });
    (0, node_test_1.it)("is handed back to the restored run", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/remind.js" } }];
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[$commandName]",
            duration: 1000,
            channelID: "chan-1",
            path: "/commands/remind.js",
            commandName: "remind",
        }), Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["remind"], "$commandName must read the same command it did when scheduled");
    });
    (0, node_test_1.it)("is matched by name when the file has moved", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/moved.js" } }];
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[$commandName]",
            duration: 1000,
            channelID: "chan-1",
            path: "/commands/remind.js",
            commandName: "remind",
        }), Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["remind"]);
    });
    (0, node_test_1.it)("is left null when the command is gone", async () => {
        harness.commands = [];
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[gone:$commandName]",
            duration: 1000,
            channelID: "chan-1",
            path: "/commands/removed.js",
            commandName: "removed",
        }), Date.now() - 1000);
        await harness.ready();
        strict_1.default.deepEqual(harness_1.marks, ["gone:"], "a missing command must not stop the timer from running");
    });
});
(0, node_test_1.describe)("the message a timer was scheduled from", () => {
    const withMessage = (messageID) => (0, harness_1.persist)(new harness_1.Timer({
        name: "n",
        kind: harness_1.TimerKind.timeout,
        code: "$testMark[$authorID]",
        duration: 1000,
        channelID: "chan-msg",
        messageID,
        hostID: "user-1",
    }), Date.now() - 1000);
    (0, node_test_1.beforeEach)(() => {
        harness.channels.set("chan-msg", {
            id: "chan-msg",
            messages: { fetch: async (id) => (id === "msg-1" ? { id, author: { id: "author-1" } } : null) },
        });
    });
    (0, node_test_1.it)("is fetched again and becomes the target", async () => {
        await withMessage("msg-1");
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.length > 0);
        strict_1.default.deepEqual(harness_1.marks, ["author-1"], "the run should see the original author");
    });
    (0, node_test_1.it)("falls back to the channel once the message is gone", async () => {
        harness.users.set("user-1", { id: "user-1" });
        await withMessage("msg-gone");
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.length > 0);
        strict_1.default.deepEqual(harness_1.marks, ["user-1"], "a deleted message must not cost the timer its run");
    });
});
(0, node_test_1.describe)("the user who scheduled a timer", () => {
    const hosted = (guildID = null) => (0, harness_1.persist)(new harness_1.Timer({
        name: "n",
        kind: harness_1.TimerKind.timeout,
        code: "$testMark[$authorID]",
        duration: 1000,
        channelID: "chan-1",
        hostID: "user-1",
        guildID,
    }), Date.now() - 1000);
    (0, node_test_1.it)("stands in as the author when the target has none", async () => {
        harness.users.set("user-1", { id: "user-1" });
        await hosted();
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.length > 0);
        strict_1.default.deepEqual(harness_1.marks, ["user-1"]);
    });
    (0, node_test_1.it)("is looked up as a member when the timer belongs to a guild", async () => {
        harness.guilds.add("guild-1");
        harness.users.set("user-1", { id: "user-1" });
        harness.members.set("user-1", { id: "user-1", nickname: "host" });
        await hosted("guild-1");
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.length > 0);
        strict_1.default.deepEqual(harness_1.marks, ["user-1"]);
    });
    (0, node_test_1.it)("leaves the run without an author when the user is gone", async () => {
        await hosted();
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.length > 0, 2000);
        strict_1.default.deepEqual(harness_1.marks, [""], "a deleted user must not stop the timer running");
    });
});
//# sourceMappingURL=restore.target.test.js.map