import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { ConfigSeed, Database, Timer, TimerKind } from "./harness"

const home = process.cwd()
const folder = mkdtempSync(join(tmpdir(), "forgetimers-forgedb-"))

before(() => {
    process.chdir(folder)
    new ConfigSeed({ type: "better-sqlite3", folder: "forgedb" } as never)
})

after(async () => {
    await Database.destroy().catch(() => undefined)
    process.chdir(home)
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

const reminder = () =>
    new Timer({
        name: "reminder",
        kind: TimerKind.timeout,
        code: "$testMark[x]",
        duration: 3_600_000,
        channelID: "chan-1",
    })

describe("opening the store twice", () => {
    it("reopens a connection forge.db kept and handed back destroyed", async () => {
        await Database.use("forgedb")
        await Database.wipe()
        await Database.set(reminder())
        await Database.destroy()

        await Database.use("forgedb")

        assert.ok(await Database.get(TimerKind.timeout, "reminder"), "the reopened store reads nothing")

        await Database.wipe()
    })
})

describe("a row an older version wrote", () => {
    it("still reads back through the schema that replaced the decorators", async () => {
        await Database.use("forgedb")
        await Database.wipe()
        await Database.destroy()

        const sqlite = require("better-sqlite3")(join(folder, "forgedb", "timers.db"))

        sqlite
            .prepare(
                `INSERT INTO timer (id, name, kind, code, path, commandName, version, duration, timestamp,
                    fireAt, guildID, channelID, hostID, messageID, args, vars)
                 VALUES (@id, @name, @kind, @code, @path, @commandName, @version, @duration, @timestamp,
                    @fireAt, @guildID, @channelID, @hostID, @messageID, @args, @vars)`
            )
            .run({
                id: "timeout:legacy",
                name: "legacy",
                kind: TimerKind.timeout,
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
            })

        sqlite.close()

        await Database.use("forgedb")
        const back = await Database.get(TimerKind.timeout, "legacy")

        assert.ok(back, "an upgrade must not lose the timers already stored")
        assert.equal(back.code, "$testMark[old]")
        assert.equal(back.fireAt, 1_700_003_600_000)
        assert.equal(back.duration, 3_600_000)
        assert.equal(back.channelID, "chan-1")
        assert.equal(back.hostID, "user-1")
        assert.deepEqual(back.args, ["first", "second"])
        assert.deepEqual(back.vars?.keywords, { k: "v" })

        await Database.wipe()
    })
})
