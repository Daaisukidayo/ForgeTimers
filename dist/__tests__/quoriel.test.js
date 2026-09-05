"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const __1 = require("..");
const structures_1 = require("../structures");
let harness;
(0, node_test_1.before)(async () => {
    harness = await (0, harness_1.boot)({}, "quoriel");
    harness.channels.set("chan-1", { id: "chan-1" });
});
(0, node_test_1.beforeEach)(async () => {
    harness.disarm();
    await harness_1.Database.wipe();
    harness_1.marks.length = 0;
});
(0, node_test_1.after)(async () => {
    harness.disarm();
    await harness.cleanup();
});
const config = () => JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(process.cwd(), "quoriel", "db", "config.json"), "utf8"));
(0, node_test_1.describe)("choosing a backend", () => {
    (0, node_test_1.it)("defaults to ForgeDB", () => {
        strict_1.default.deepEqual(new __1.ForgeTimers().requireExtensions, ["forge.db"]);
    });
    (0, node_test_1.it)("requires QuorielDB instead when asked for it", () => {
        strict_1.default.deepEqual(new __1.ForgeTimers({ storage: "quorieldb" }).requireExtensions, ["QuorielDB"]);
    });
    (0, node_test_1.it)("opened the store the option asked for", async () => {
        strict_1.default.ok((await harness_1.Database.use("quorieldb")) instanceof structures_1.QuorielDBStore);
    });
});
(0, node_test_1.describe)("the record type", () => {
    (0, node_test_1.it)("registers itself in the config", () => {
        strict_1.default.deepEqual(config().types[structures_1.QUORIEL_TYPE], { type: null, guild: false });
    });
    (0, node_test_1.it)("leaves QuorielDB's own types alone", () => {
        strict_1.default.ok(config().types.user, "the stock types were overwritten");
        strict_1.default.ok(config().types.member);
    });
    (0, node_test_1.it)("does not register itself twice", async () => {
        const before = JSON.stringify(config());
        await harness_1.Database.use("quorieldb");
        strict_1.default.equal(JSON.stringify(config()), before);
    });
});
(0, node_test_1.describe)("timers on lmdb", () => {
    (0, node_test_1.it)("persists a timer scheduled from a script", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[x];1h;reminder]");
        const row = await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder");
        strict_1.default.ok(row);
        strict_1.default.equal(row.code, "$testMark[x]");
        strict_1.default.equal(row.duration, 3_600_000);
    });
    (0, node_test_1.it)("runs a timeout and clears its record", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[fired];60;quick]");
        await (0, harness_1.waitFor)(async () => (await harness_1.Database.get(harness_1.TimerKind.timeout, "quick")) === null);
        strict_1.default.deepEqual(harness_1.marks, ["fired"]);
    });
    (0, node_test_1.it)("restores a stored timer on startup", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "survivor",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[restored]",
            duration: 60_000,
            channelID: "chan-1",
        }), Date.now() - 1000);
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.includes("restored"));
        strict_1.default.deepEqual(harness_1.marks, ["restored"]);
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "survivor"), null);
    });
    (0, node_test_1.it)("resumes an interval on the time left rather than a fresh tick", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "beat",
            kind: harness_1.TimerKind.interval,
            code: "$testMark[tick]",
            duration: 3_600_000,
            channelID: "chan-1",
        }), Date.now() + 200);
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.length > 0);
        strict_1.default.deepEqual(harness_1.marks, ["tick"]);
        const row = await harness_1.Database.get(harness_1.TimerKind.interval, "beat");
        strict_1.default.ok(row.timeLeft() > 3_000_000, "the next tick was not a full duration away");
    });
    (0, node_test_1.it)("keeps variables through a restart", async () => {
        await (0, harness_1.run)(harness, "$let[note;kept]$setTimeout[$testMark[$get[note]];60;vars]");
        harness.disarm();
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.length > 0);
        strict_1.default.deepEqual(harness_1.marks, ["kept"]);
    });
});
//# sourceMappingURL=quoriel.test.js.map