"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerKind = exports.Timer = exports.Database = exports.marks = exports.DATABASE_ENV = exports.ConfigSeed = void 0;
exports.connectionFor = connectionFor;
exports.waitFor = waitFor;
exports.attach = attach;
exports.boot = boot;
exports.run = run;
exports.persist = persist;
const forge_db_1 = require("@tryforge/forge.db");
const forgescript_1 = require("@tryforge/forgescript");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const __1 = require("..");
const structures_1 = require("../structures");
Object.defineProperty(exports, "Database", { enumerable: true, get: function () { return structures_1.Database; } });
Object.defineProperty(exports, "Timer", { enumerable: true, get: function () { return structures_1.Timer; } });
Object.defineProperty(exports, "TimerKind", { enumerable: true, get: function () { return structures_1.TimerKind; } });
class ConfigSeed extends forge_db_1.DataBaseManager {
    database = "seed";
    entityManager = { sqlite: [], mongodb: [], mysql: [], postgres: [] };
}
exports.ConfigSeed = ConfigSeed;
exports.DATABASE_ENV = {
    postgres: "FORGETIMERS_TEST_POSTGRES",
    mysql: "FORGETIMERS_TEST_MYSQL",
    mongodb: "FORGETIMERS_TEST_MONGODB",
};
function connectionFor(target) {
    if (target === "sqlite" || target === "quoriel") {
        const folder = (0, node_fs_1.mkdtempSync)((0, node_path_1.join)((0, node_os_1.tmpdir)(), "forgetimers-test-"));
        return { type: target === "quoriel" ? "quoriel" : "better-sqlite3", folder };
    }
    const url = process.env[exports.DATABASE_ENV[target]];
    if (!url)
        return null;
    return { type: target, url };
}
let seeded = false;
exports.marks = [];
/** Waits for something to become true instead of guessing how long it takes */
async function waitFor(condition, timeout = 5000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await condition())
            return true;
        await new Promise((r) => setTimeout(r, 10));
    }
    return await condition();
}
let markRegistered = false;
function registerMark() {
    if (markRegistered)
        return;
    markRegistered = true;
    forgescript_1.FunctionManager.add(new forgescript_1.NativeFunction({
        name: "$testMark",
        version: "1.0.0",
        description: "Records that this point was reached, for the test suite",
        unwrap: true,
        brackets: true,
        args: [{ name: "label", description: "What to record", rest: false, required: true, type: forgescript_1.ArgType.String }],
        execute(_ctx, [label]) {
            exports.marks.push(label);
            return this.success();
        },
    }));
}
/** forge.db arms this on every connection and never clears it, so the process idles it out */
const FORGE_DB_WATCHDOG = 10_000;
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((handler, ms, ...rest) => {
    const handle = realSetTimeout(handler, ms, ...rest);
    if (ms === FORGE_DB_WATCHDOG)
        handle.unref?.();
    return handle;
});
/** Wraps an extension in a client it can believe in, without any of the setup boot() does */
function attach(ext) {
    const channels = new Map();
    const users = new Map();
    const members = new Map();
    const guilds = new Set();
    const handlers = [];
    const fetches = { channels: 0 };
    const harness = {
        ext,
        channels,
        users,
        members,
        fetches,
        commands: [],
        guilds,
        client: undefined,
        async ready() {
            for (const handler of handlers)
                await handler();
        },
        disarm() {
            for (const map of [harness.client.timeouts, harness.client.intervals]) {
                for (const handle of map.values())
                    clearTimeout(handle);
                map.clear();
            }
        },
    };
    harness.client = {
        // a migration checks here for the extension it reads the old timers out of
        options: { extensions: [{ name: "forge.db" }, { name: "QuorielDB" }] },
        canRespondToBots: () => true,
        timeouts: new Map(),
        intervals: new Map(),
        shard: null,
        guilds: {
            cache: {
                has: (id) => guilds.has(id),
                // a guild this process cannot see has no members to hand back either
                get: (id) => guilds.has(id)
                    ? { id, members: { fetch: async (userID) => members.get(userID) ?? null } }
                    : undefined,
            },
        },
        users: { fetch: async (id) => users.get(id) ?? null },
        channels: {
            fetch: async (id) => {
                fetches.channels++;
                if (harness.channelError)
                    throw harness.channelError;
                return channels.get(id) ?? null;
            },
        },
        commands: { toArray: () => harness.commands },
        getExtension: () => ext,
        once: (_event, handler) => handlers.push(handler),
    };
    ext.init(harness.client);
    // after init, or the extension's own natives lose to the stock ones
    forgescript_1.FunctionManager.loadNative();
    registerMark();
    return harness;
}
async function boot(options = {}, target = "sqlite") {
    const connection = connectionFor(target);
    if (!connection)
        throw new Error(`${exports.DATABASE_ENV[target]} is not set`);
    const folder = "folder" in connection ? connection.folder : undefined;
    const home = process.cwd();
    if (target === "quoriel") {
        // quoriel hangs its store off the working directory
        options = { ...options, storage: "quorieldb" };
        process.chdir(folder);
    }
    else if (!seeded) {
        new ConfigSeed(connection);
        seeded = true;
    }
    const harness = attach(new __1.ForgeTimers(options));
    await harness.ext.ready;
    await structures_1.Database.wipe().catch(() => undefined);
    async function cleanup() {
        await structures_1.Database.wipe().catch(() => undefined);
        await structures_1.Database.destroy().catch(() => undefined);
        process.chdir(home);
        if (!folder)
            return;
        try {
            (0, node_fs_1.rmSync)(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        }
        catch {
            void 0;
        }
    }
    return Object.assign(harness, { folder, cleanup });
}
async function run(harness, code, target = { channel: { id: "chan-1" } }) {
    return await forgescript_1.Interpreter.run(new forgescript_1.Context({
        client: harness.client,
        data: forgescript_1.Compiler.compile(code),
        command: null,
        obj: target,
        doNotSend: true,
        redirectErrorsToConsole: true,
    }));
}
async function persist(timer, fireAt = timer.fireAt) {
    timer.fireAt = fireAt;
    await structures_1.Database.set(timer);
    return timer;
}
//# sourceMappingURL=harness.js.map