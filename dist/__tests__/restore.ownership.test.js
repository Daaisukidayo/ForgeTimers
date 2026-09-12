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
(0, node_test_1.describe)("ownership across processes", () => {
    (0, node_test_1.it)("leaves a timer whose guild this process cannot see", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[n]",
            duration: 1000,
            channelID: "chan-1",
            guildID: "guild-elsewhere",
        }), Date.now() + 60_000);
        await harness.ready();
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "another shard's timer is not ours to delete");
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "nor ours to run");
    });
    (0, node_test_1.it)("prunes it only when asked to", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[n]",
            duration: 1000,
            channelID: "chan-1",
            guildID: "guild-elsewhere",
        }), Date.now() + 60_000);
        Object.assign(harness.ext.options, { pruneUnknownGuilds: true });
        await harness.ready();
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null);
    });
    (0, node_test_1.it)("restores a timer whose guild this process can see", async () => {
        harness.guilds.add("guild-mine");
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "n",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[n]",
            duration: 1000,
            channelID: "chan-1",
            guildID: "guild-mine",
        }), Date.now() + 60_000);
        await harness.ready();
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
});
(0, node_test_1.describe)("a timer belonging to no guild", () => {
    const guildless = (name = "n") => (0, harness_1.persist)(new harness_1.Timer({ name, kind: harness_1.TimerKind.timeout, code: `$testMark[${name}]`, duration: 1000 }), Date.now() + 60_000);
    (0, node_test_1.it)("is restored on an unsharded process", async () => {
        await guildless();
        await harness.ready();
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
    (0, node_test_1.it)("is restored on shard 0", async () => {
        harness.client.shard = { ids: [0] };
        await guildless();
        await harness.ready();
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
    (0, node_test_1.it)("is left alone on every other shard", async () => {
        // otherwise each shard would run it
        harness.client.shard = { ids: [1] };
        await guildless();
        await harness.ready();
        strict_1.default.equal(harness.client.timeouts.has("n"), false, "another shard already has this one");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), "and it is not that shard's to delete");
    });
    (0, node_test_1.it)("is restored once when shard 0 shares a process", async () => {
        harness.client.shard = { ids: [0, 1, 2] };
        await guildless();
        await harness.ready();
        strict_1.default.equal(harness.client.timeouts.has("n"), true);
    });
});
//# sourceMappingURL=restore.ownership.test.js.map