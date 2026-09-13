"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_path_1 = require("node:path");
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const folder = (0, harness_1.useTempHome)("forgetimers-forgedb");
const reminder = () => new harness_1.Timer({
    name: "reminder",
    kind: harness_1.TimerKind.timeout,
    code: "$testMark[x]",
    duration: 3_600_000,
    channelID: "chan-1",
});
(0, node_test_1.describe)("opening the store twice", () => {
    (0, node_test_1.it)("reopens a connection forge.db kept and handed back destroyed", async () => {
        await harness_1.Database.use("forgedb");
        await harness_1.Database.wipe();
        await harness_1.Database.set(reminder());
        await harness_1.Database.destroy();
        await harness_1.Database.use("forgedb");
        strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder"), "the reopened store reads nothing");
        await harness_1.Database.wipe();
    });
});
(0, node_test_1.describe)("a row an older version wrote", () => {
    (0, node_test_1.it)("still reads back through the schema that replaced the decorators", async () => {
        await harness_1.Database.use("forgedb");
        await harness_1.Database.wipe();
        await harness_1.Database.destroy();
        const sqlite = require("better-sqlite3")((0, node_path_1.join)(folder, "forgedb", "timers.db"));
        sqlite
            .prepare(`INSERT INTO timer (id, name, kind, code, path, commandName, version, duration, timestamp,
                    fireAt, guildID, channelID, hostID, messageID, args, vars)
                 VALUES (@id, @name, @kind, @code, @path, @commandName, @version, @duration, @timestamp,
                    @fireAt, @guildID, @channelID, @hostID, @messageID, @args, @vars)`)
            .run({
            id: "timeout:legacy",
            name: "legacy",
            kind: harness_1.TimerKind.timeout,
            code: "$testMark[old]",
            path: null,
            commandName: null,
            version: null,
            duration: 3_600_000,
            timestamp: 1_700_000_000_000,
            fireAt: 1_700_003_600_000,
            guildID: "guild-1",
            channelID: "chan-1",
            hostID: "user-1",
            messageID: "msg-1",
            args: JSON.stringify(["first", "second"]),
            vars: JSON.stringify({ keywords: { k: "v" }, environment: {}, localFunctions: {} }),
        });
        sqlite.close();
        await harness_1.Database.use("forgedb");
        const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "legacy");
        strict_1.default.ok(back, "an upgrade must not lose the timers already stored");
        strict_1.default.equal(back.code, "$testMark[old]");
        strict_1.default.equal(back.fireAt, 1_700_003_600_000);
        strict_1.default.equal(back.duration, 3_600_000);
        strict_1.default.equal(back.channelID, "chan-1");
        strict_1.default.equal(back.hostID, "user-1");
        strict_1.default.deepEqual(back.args, ["first", "second"]);
        strict_1.default.deepEqual(back.vars?.keywords, { k: "v" });
        await harness_1.Database.wipe();
    });
});
//# sourceMappingURL=forgedb.test.js.map