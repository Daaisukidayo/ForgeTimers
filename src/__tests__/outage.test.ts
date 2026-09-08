import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import { boot, Database, marks, persist, run, Timer, TimerKind, waitFor } from "./harness"

let harness: Awaited<ReturnType<typeof boot>>

before(async () => {
    harness = await boot()
    harness.channels.set("chan-1", { id: "chan-1" })
})

beforeEach(async () => {
    repair()
    harness.disarm()
    await Database.wipe()
    marks.length = 0
})

after(async () => {
    repair()
    harness.disarm()
    await harness.cleanup()
})

type DatabaseCall = "set" | "delete" | "getAll" | "wipe"

const originals = new Map<DatabaseCall, unknown>()

/** Takes a call away the way a connection dropped after startup would */
function breaks(...calls: DatabaseCall[]) {
    for (const call of calls) {
        if (!originals.has(call)) originals.set(call, Database[call])

        Database[call] = (async () => {
            throw new Error(`the database went away (${call})`)
        }) as never
    }
}

function repair() {
    for (const [call, original] of originals) Database[call] = original as never
    originals.clear()
}

const timer = (name: string, kind = TimerKind.timeout, duration = 50) =>
    new Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" })

describe("a database that fails after startup", () => {
    it("keeps running a timer it could not write down", async () => {
        breaks("set")

        assert.equal(await run(harness, "$setTimeout[$testMark[unsaved];50;n]"), "")
        assert.ok(harness.client.timeouts.has("n"), "a failed write must not cost the live timer")
        assert.ok(await waitFor(() => marks.includes("unsaved")), "the timer never ran")
    })

    it("keeps ticking an interval it could not write down", async () => {
        breaks("set")

        assert.equal(await run(harness, "$setInterval[$testMark[tick];50;n]"), "")
        assert.ok(await waitFor(() => marks.filter((m) => m === "tick").length >= 2), "the interval stopped")
    })

    it("still fires a timeout whose row it cannot delete afterwards", async () => {
        await harness.ext.timersManager.start(timer("n"), async () => void marks.push("fired"))
        breaks("delete")

        assert.ok(await waitFor(() => marks.includes("fired")), "the timer never ran")
        assert.equal(harness.client.timeouts.has("n"), false, "the live handle outlived the run")
    })

    it("cancels a timer it cannot forget, and says the row is still there", async () => {
        await harness.ext.timersManager.start(timer("n", TimerKind.timeout, 60_000), async () => void 0)
        breaks("delete")

        assert.deepEqual(
            await harness.ext.timersManager.stop(TimerKind.timeout, "n"),
            [true, false],
            "a failed delete must not be reported as a forgotten timer"
        )
        assert.equal(harness.client.timeouts.has("n"), false, "the live timer was left armed")
    })

    it("reports a clear as done when only the live timer could be cancelled", async () => {
        await run(harness, "$setTimeout[$testMark[cleared];60000;n]")
        breaks("delete")

        assert.equal(await run(harness, "$clearTimeout[n]"), "true")
        assert.equal(harness.client.timeouts.has("n"), false)
    })

    it("cancels every live timer even when the table cannot be emptied", async () => {
        await run(harness, "$setTimeout[$testMark[a];60000;a]")
        await run(harness, "$setInterval[$testMark[b];60000;b]")
        breaks("wipe")

        assert.equal(await run(harness, "$wipeTimers"), "2")
        assert.equal(harness.client.timeouts.size, 0)
        assert.equal(harness.client.intervals.size, 0)
    })

    it("boots without restoring anything when the timers cannot be read", async () => {
        await persist(timer("n", TimerKind.timeout, 60_000), Date.now() - 1000)
        breaks("getAll")

        await harness.ready()

        assert.deepEqual(marks, [], "a timer was restored out of a read that failed")
        assert.equal(harness.client.timeouts.size, 0)

        repair()
        assert.ok(await Database.get(TimerKind.timeout, "n"), "the record was dropped over a failed read")
    })
})
