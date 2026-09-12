import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    attach,
    contentsOf,
    Database,
    ITestClient,
    marks,
    run,
    Timer,
    TimerKind,
    useTempHome,
    waitFor,
} from "./harness"
import { ForgeTimers } from ".."

useTempHome("forgetimers-boot")

/** Runs `fn` against an extension whose backend could not be required at all */
async function withoutForgeDB(fn: (harness: ITestClient) => Promise<void>) {
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
        await fn(harness)
    } finally {
        require("module")._resolveFilename = resolve
        harness.disarm()
    }
}

describe("a backend that will not open", () => {
    it("leaves the bot running, with timers that do not survive a restart", async () => {
        await withoutForgeDB(async (harness) => {
            marks.length = 0
            await run(harness, "$setTimeout[$testMark[unpersisted];50;quick]")
            assert.ok(await waitFor(() => marks.includes("unpersisted")), "the timer never ran")
        })
    })

    it("reads back nothing instead of erroring out of the script", async () => {
        await withoutForgeDB(async (harness) => {
            await run(harness, "$setTimeout[$testMark[unread];1h;quick]")

            assert.equal(await run(harness, "$getTimer[timeout;quick]"), "")
            assert.equal(await run(harness, "$getTimer[timeout;quick;timeLeft]"), "")
            assert.equal(await run(harness, "$getAllTimers"), "[]")
            assert.equal(await run(harness, "$getAllTimers[timeout]"), "[]")
        })
    })

    it("still cancels the live timers a script asks it to", async () => {
        await withoutForgeDB(async (harness) => {
            marks.length = 0
            await run(harness, "$setTimeout[$testMark[cancelled];50;quick]")

            assert.equal(await run(harness, "$wipeTimers"), "1")
            assert.equal(harness.client.timeouts.size, 0)

            await run(harness, "$setTimeout[$testMark[cancelled];50;quick]")
            await run(harness, "$clearTimeout[quick]")

            assert.equal(harness.client.timeouts.size, 0)
            assert.ok(!(await waitFor(() => marks.includes("cancelled"), 300)), "a cancelled timer still ran")
        })
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
