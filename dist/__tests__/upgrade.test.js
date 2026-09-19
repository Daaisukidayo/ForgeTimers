"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./support/harness");
(0, harness_1.useTempHome)("forgetimers-upgrade");
/** The store keeps its connection to itself, and only a test has business running DDL on it */
const sourceOf = (store) => store.source;
const columnsOf = async (store) => {
    const columns = (await sourceOf(store).query("PRAGMA table_info(timer)"));
    return columns.map((column) => column.name);
};
/**
 * Every other suite opens a database it just created, so nothing else covers the one upgrade
 * path every existing bot takes: a file written by a build that had fewer columns.
 */
(0, node_test_1.describe)("opening a database an older build left behind", () => {
    (0, node_test_1.it)("adds the columns it is missing, and keeps the rows", async () => {
        const store = await harness_1.Database.use("forgedb");
        await harness_1.Database.set(new harness_1.Timer({
            name: "beat",
            kind: harness_1.TimerKind.interval,
            code: "$testMark[beat]",
            duration: 60_000,
            channelID: "chan-1",
            config: { restoredTicksLimit: "Infinity" },
        }));
        // strip what this build added, so the file looks like one an older build wrote
        for (const column of ["config", "pausedAt"]) {
            await sourceOf(store).query(`ALTER TABLE timer DROP COLUMN ${column}`);
        }
        strict_1.default.equal((await columnsOf(store)).includes("config"), false, "nothing was dropped, so this proves nothing");
        await harness_1.Database.destroy();
        const reopened = await harness_1.Database.use("forgedb");
        const names = await columnsOf(reopened);
        strict_1.default.ok(names.includes("config"), "config was never added back");
        strict_1.default.ok(names.includes("pausedAt"), "pausedAt was never added back");
        const back = await harness_1.Database.get(harness_1.TimerKind.interval, "beat");
        strict_1.default.ok(back, "the stored timer did not survive the upgrade");
        strict_1.default.equal(back.duration, 60_000);
        strict_1.default.equal(back.code, "$testMark[beat]");
        strict_1.default.equal(typeof back.fireAt, "number", "its deadline has to come back as a number");
    });
    (0, node_test_1.it)("reads a row written before those columns existed as having neither", async () => {
        const store = await harness_1.Database.use("forgedb");
        await harness_1.Database.wipe();
        await sourceOf(store).query("ALTER TABLE timer DROP COLUMN config");
        const now = Date.now();
        await sourceOf(store).query(`INSERT INTO timer (id, name, kind, code, duration, timestamp, fireAt)
             VALUES ('timeout:old', 'old', 'timeout', '$testMark[old]', 60000, ${now}, ${now + 60_000})`);
        await harness_1.Database.destroy();
        await harness_1.Database.use("forgedb");
        const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "old");
        strict_1.default.ok(back, "the row from the older build was lost");
        strict_1.default.equal(back.config, null, "it never named any options, so it has none");
        strict_1.default.equal(back.pausedAt, null, "and it was never paused");
        strict_1.default.equal(back.isPaused(), false, "so it must not read as on hold");
    });
});
//# sourceMappingURL=upgrade.test.js.map