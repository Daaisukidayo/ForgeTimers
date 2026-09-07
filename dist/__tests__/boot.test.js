"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const __1 = require("..");
const home = process.cwd();
const folder = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "forgetimers-boot-"));
(0, node_test_1.before)(() => {
    // quoriel hangs its store off the working directory, forge.db off its configured folder
    process.chdir(folder);
    new harness_1.ConfigSeed({ type: "better-sqlite3", folder: "forgedb" });
});
(0, node_test_1.after)(async () => {
    await harness_1.Database.destroy().catch(() => undefined);
    process.chdir(home);
    (0, node_fs_1.rmSync)(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
/** Reads a backend without leaving it in charge */
async function contentsOf(storage) {
    const store = await harness_1.Database.open(storage);
    const all = await store.getAll();
    await store.destroy();
    return all.map((timer) => timer.id);
}
/** Runs `fn` against an extension whose backend could not be required at all */
async function withoutForgeDB(fn) {
    const resolve = require("module")._resolveFilename;
    require("module")._resolveFilename = function (request, ...rest) {
        if (request === "@tryforge/forge.db") {
            throw Object.assign(new Error(`Cannot find module '${request}'`), { code: "MODULE_NOT_FOUND" });
        }
        return resolve.call(this, request, ...rest);
    };
    const harness = (0, harness_1.attach)(new __1.ForgeTimers());
    try {
        strict_1.default.equal(await harness.ext.ready, false, "a missing backend must not reject the boot");
        await fn(harness);
    }
    finally {
        require("module")._resolveFilename = resolve;
        harness.disarm();
    }
}
(0, node_test_1.describe)("a backend that will not open", () => {
    (0, node_test_1.it)("leaves the bot running, with timers that do not survive a restart", async () => {
        await withoutForgeDB(async (harness) => {
            harness_1.marks.length = 0;
            await (0, harness_1.run)(harness, "$setTimeout[$testMark[unpersisted];50;quick]");
            strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("unpersisted")), "the timer never ran");
        });
    });
    (0, node_test_1.it)("reads back nothing instead of erroring out of the script", async () => {
        await withoutForgeDB(async (harness) => {
            await (0, harness_1.run)(harness, "$setTimeout[$testMark[unread];1h;quick]");
            strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;quick]"), "");
            strict_1.default.equal(await (0, harness_1.run)(harness, "$getTimer[timeout;quick;timeLeft]"), "");
            strict_1.default.equal(await (0, harness_1.run)(harness, "$getAllTimers"), "[]");
            strict_1.default.equal(await (0, harness_1.run)(harness, "$getAllTimers[timeout]"), "[]");
        });
    });
    (0, node_test_1.it)("still cancels the live timers a script asks it to", async () => {
        await withoutForgeDB(async (harness) => {
            harness_1.marks.length = 0;
            await (0, harness_1.run)(harness, "$setTimeout[$testMark[cancelled];50;quick]");
            strict_1.default.equal(await (0, harness_1.run)(harness, "$wipeTimers"), "1");
            strict_1.default.equal(harness.client.timeouts.size, 0);
            await (0, harness_1.run)(harness, "$setTimeout[$testMark[cancelled];50;quick]");
            await (0, harness_1.run)(harness, "$clearTimeout[quick]");
            strict_1.default.equal(harness.client.timeouts.size, 0);
            strict_1.default.ok(!(await (0, harness_1.waitFor)(() => harness_1.marks.includes("cancelled"), 300)), "a cancelled timer still ran");
        });
    });
});
(0, node_test_1.describe)("migrating on startup", () => {
    (0, node_test_1.it)("moves the timers in before restoring them", async () => {
        await harness_1.Database.use("forgedb");
        await harness_1.Database.wipe();
        const due = new harness_1.Timer({
            name: "reminder",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[migrated]",
            duration: 60_000,
            channelID: "chan-1",
        });
        due.fireAt = Date.now() - 1000;
        await harness_1.Database.set(due);
        await harness_1.Database.destroy();
        harness_1.marks.length = 0;
        const harness = (0, harness_1.attach)(new __1.ForgeTimers({ storage: "quorieldb", migrateFrom: "forgedb" }));
        strict_1.default.equal(await harness.ext.ready, true);
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder"), "the timer never reached the new backend");
        strict_1.default.deepEqual(await contentsOf("forgedb"), [], "the old backend kept it");
        harness.channels.set("chan-1", { id: "chan-1" });
        await harness.ready();
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("migrated")), "the migrated timer was never restored");
        harness.disarm();
        await harness_1.Database.wipe();
    });
});
//# sourceMappingURL=boot.test.js.map