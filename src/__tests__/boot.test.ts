import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, describe, it } from "node:test"
import { attach, ConfigSeed, Database, marks, run, Timer, TimerKind, waitFor } from "./harness"
import { ForgeTimers, TimerStorage } from ".."

const home = process.cwd()
const folder = mkdtempSync(join(tmpdir(), "forgetimers-boot-"))

before(() => {
    // quoriel hangs its store off the working directory, forge.db off its configured folder
    process.chdir(folder)
    new ConfigSeed({ type: "better-sqlite3", folder: "forgedb" } as never)
})

after(async () => {
    await Database.destroy().catch(() => undefined)
    process.chdir(home)
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

/** Reads a backend without leaving it in charge */
async function contentsOf(storage: TimerStorage) {
    const store = await Database.open(storage)
    const all = await store.getAll()
    await store.destroy()

    return all.map((timer) => timer.id)
}

// first, or forge.db is already loaded and hiding it proves nothing
describe("a backend that will not open", () => {
    it("leaves the bot running, with timers that do not survive a restart", async () => {
        const resolve = require("module")._resolveFilename

        require("module")._resolveFilename = function (request: string, ...rest: unknown[]) {
            if (request === "@tryforge/forge.db") {
                throw Object.assign(new Error(`Cannot find module '${request}'`), { code: "MODULE_NOT_FOUND" })
            }
            return resolve.call(this, request, ...rest)
        }

        const harness = attach(new ForgeTimers())

        try {
            assert.equal(await harness.ext.ready, false, "a missing backend must not reject the boot")

            marks.length = 0
            await run(harness, "$setTimeout[$testMark[unpersisted];50;quick]")
            assert.ok(await waitFor(() => marks.includes("unpersisted")), "the timer never ran")
        } finally {
            require("module")._resolveFilename = resolve
            harness.disarm()
        }
    })
})

describe("migrating on startup", () => {
    it("moves the timers in before restoring them", async () => {
        await Database.use("forgedb")
        await Database.wipe()

        const due = new Timer({
            name: "reminder",
            kind: TimerKind.timeout,
            code: "$testMark[migrated]",
            duration: 60_000,
            channelID: "chan-1",
        })

        due.fireAt = Date.now() - 1000
        await Database.set(due)
        await Database.destroy()

        marks.length = 0
        const harness = attach(new ForgeTimers({ storage: "quorieldb", migrateFrom: "forgedb" }))

        assert.equal(await harness.ext.ready, true)
        assert.ok(await Database.get(TimerKind.timeout, "reminder"), "the timer never reached the new backend")
        assert.deepEqual(await contentsOf("forgedb"), [], "the old backend kept it")

        harness.channels.set("chan-1", { id: "chan-1" })
        await harness.ready()

        assert.ok(await waitFor(() => marks.includes("migrated")), "the migrated timer was never restored")

        harness.disarm()
        await Database.wipe()
    })
})
