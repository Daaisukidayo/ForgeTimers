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
const folder = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "forgetimers-migrate-"));
const clientWith = (...extensions) => ({ options: { extensions: extensions.map((name) => ({ name })) } });
const both = clientWith("forge.db", "QuorielDB");
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
(0, node_test_1.beforeEach)(async () => {
    for (const storage of ["forgedb", "quorieldb"]) {
        await harness_1.Database.use(storage);
        await harness_1.Database.wipe();
    }
});
const timer = (name, dueIn = 3_600_000, kind = harness_1.TimerKind.timeout) => new harness_1.Timer({ name, kind, code: `$testMark[${name}]`, duration: dueIn, channelID: "chan-1" });
/** Fills `from` with timers, then opens `to` ready for a migration */
async function seed(from, to, timers) {
    await harness_1.Database.use(from);
    for (const t of timers)
        await harness_1.Database.set(t);
    await harness_1.Database.use(to);
}
/** Reads a backend without leaving it in charge */
async function contentsOf(storage) {
    const store = await harness_1.Database.open(storage);
    const all = await store.getAll();
    await store.destroy();
    return all.map((t) => t.id).sort();
}
(0, node_test_1.describe)("moving timers between backends", () => {
    for (const [from, to] of [
        ["forgedb", "quorieldb"],
        ["quorieldb", "forgedb"],
    ]) {
        (0, node_test_1.it)(`moves them from ${from} to ${to}`, async () => {
            const original = timer("reminder");
            await seed(from, to, [original, timer("beat", 60_000, harness_1.TimerKind.interval)]);
            const result = await (0, __1.migrateTimers)(both, from, to);
            strict_1.default.deepEqual(result, { moved: 2, skipped: [], drained: true });
            strict_1.default.deepEqual(await contentsOf(to), ["interval:beat", "timeout:reminder"]);
            strict_1.default.deepEqual(await contentsOf(from), [], "the source was not drained");
        });
        (0, node_test_1.it)(`keeps the deadline intact from ${from} to ${to}`, async () => {
            const original = timer("reminder");
            await seed(from, to, [original]);
            await (0, __1.migrateTimers)(both, from, to);
            const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder");
            strict_1.default.equal(back.fireAt, original.fireAt);
            strict_1.default.equal(back.duration, original.duration);
            strict_1.default.equal(back.code, "$testMark[reminder]");
            strict_1.default.ok(back.timeLeft() > 3_000_000, "a moved timer must not restart its wait");
        });
    }
    (0, node_test_1.it)("carries every field across", async () => {
        const original = new harness_1.Timer({
            name: "full",
            kind: harness_1.TimerKind.timeout,
            code: "$sendMessage[hi]",
            path: "/cmd.js",
            commandName: "cmd",
            duration: 90 * 24 * 60 * 60 * 1000,
            guildID: "guild-1",
            channelID: "chan-1",
            hostID: "user-1",
            messageID: "msg-1",
            args: ["a", "b"],
            vars: { keywords: { k: "v" }, environment: { n: 1 }, localFunctions: {} },
        });
        await seed("forgedb", "quorieldb", [original]);
        await (0, __1.migrateTimers)(both, "forgedb", "quorieldb");
        const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "full");
        strict_1.default.equal(back.guildID, "guild-1");
        strict_1.default.equal(back.hostID, "user-1");
        strict_1.default.equal(back.messageID, "msg-1");
        strict_1.default.equal(back.commandName, "cmd");
        strict_1.default.equal(back.path, "/cmd.js");
        strict_1.default.deepEqual(back.args, ["a", "b"]);
        strict_1.default.deepEqual(back.vars, original.vars);
        strict_1.default.equal(back.version, harness_1.Timer.SCHEMA_VERSION);
    });
});
(0, node_test_1.describe)("running it more than once", () => {
    (0, node_test_1.it)("does nothing the second time", async () => {
        await seed("forgedb", "quorieldb", [timer("once")]);
        await (0, __1.migrateTimers)(both, "forgedb", "quorieldb");
        const again = await (0, __1.migrateTimers)(both, "forgedb", "quorieldb");
        strict_1.default.deepEqual(again, { moved: 0, skipped: [], drained: true });
        strict_1.default.deepEqual(await contentsOf("quorieldb"), ["timeout:once"]);
    });
    (0, node_test_1.it)("cannot resurrect a timer that already fired", async () => {
        await seed("forgedb", "quorieldb", [timer("spent")]);
        await (0, __1.migrateTimers)(both, "forgedb", "quorieldb");
        // the timeout runs and clears itself, the way a restored one would
        await harness_1.Database.delete(harness_1.TimerKind.timeout, "spent");
        await (0, __1.migrateTimers)(both, "forgedb", "quorieldb");
        strict_1.default.deepEqual(await contentsOf("quorieldb"), []);
    });
});
(0, node_test_1.describe)("names already taken", () => {
    (0, node_test_1.it)("leaves the target's own timer alone", async () => {
        await seed("forgedb", "quorieldb", [timer("shared", 1000), timer("free")]);
        await harness_1.Database.set(timer("shared", 7_200_000));
        const result = await (0, __1.migrateTimers)(both, "forgedb", "quorieldb");
        strict_1.default.equal(result.moved, 1);
        strict_1.default.deepEqual(result.skipped, ["timeout:shared"]);
        strict_1.default.equal(result.drained, false, "a skipped timer means the source still holds something");
        const kept = await harness_1.Database.get(harness_1.TimerKind.timeout, "shared");
        strict_1.default.equal(kept.duration, 7_200_000, "the target's timer was overwritten");
        strict_1.default.deepEqual(await contentsOf("forgedb"), ["timeout:shared"], "the skipped one must stay put");
    });
});
(0, node_test_1.describe)("copying instead of moving", () => {
    (0, node_test_1.it)("leaves the source untouched", async () => {
        await seed("forgedb", "quorieldb", [timer("kept")]);
        const result = await (0, __1.migrateTimers)(both, "forgedb", "quorieldb", true);
        strict_1.default.equal(result.moved, 1);
        strict_1.default.equal(result.drained, false);
        strict_1.default.deepEqual(await contentsOf("forgedb"), ["timeout:kept"]);
        strict_1.default.deepEqual(await contentsOf("quorieldb"), ["timeout:kept"]);
    });
});
(0, node_test_1.describe)("a target that loses a write", () => {
    (0, node_test_1.it)("stops without dropping anything from the source", async () => {
        await seed("forgedb", "quorieldb", [timer("fragile"), timer("fine")]);
        const real = harness_1.Database.get;
        // accepts the write and does not keep it - exactly what the read-back guards against
        harness_1.Database.get = (async (kind, name) => name === "fragile" ? null : await real.call(harness_1.Database, kind, name));
        try {
            strict_1.default.equal(await (0, __1.migrateTimers)(both, "forgedb", "quorieldb"), null);
        }
        finally {
            harness_1.Database.get = real;
        }
        strict_1.default.ok((await contentsOf("forgedb")).includes("timeout:fragile"), "the source lost a timer the target never kept");
    });
});
(0, node_test_1.describe)("refusing to run", () => {
    (0, node_test_1.it)("says so when the source extension is missing", async () => {
        await seed("forgedb", "quorieldb", [timer("stranded")]);
        const result = await (0, __1.migrateTimers)(clientWith("QuorielDB"), "forgedb", "quorieldb");
        strict_1.default.equal(result, null);
        strict_1.default.deepEqual(await contentsOf("forgedb"), ["timeout:stranded"], "nothing may move");
    });
    (0, node_test_1.it)("says so when both ends are the same backend", async () => {
        await harness_1.Database.use("quorieldb");
        strict_1.default.equal(await (0, __1.migrateTimers)(both, "quorieldb", "quorieldb"), null);
    });
});
//# sourceMappingURL=migrate.test.js.map