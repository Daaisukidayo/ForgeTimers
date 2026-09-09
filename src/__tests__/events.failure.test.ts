import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import { boot, Database, marks, run, TimerKind, waitFor } from "./harness"
import { TimerEvent } from "../types"

let harness: Awaited<ReturnType<typeof boot>>

before(async () => {
    harness = await boot({ events: [TimerEvent.timerStart, TimerEvent.timerFire, TimerEvent.timerCancel] })
    harness.channels.set("chan-1", { id: "chan-1" })

    for (const event of [TimerEvent.timerStart, TimerEvent.timerFire, TimerEvent.timerCancel]) {
        harness.ext.commands.add({ type: event, code: `$testMark[${event}-reached]$testBoom` })
    }
})

beforeEach(async () => {
    harness.disarm()
    await Database.wipe()
    marks.length = 0
})

after(async () => {
    harness.disarm()
    await harness.cleanup()
})

const marked = (mark: string) => waitFor(() => marks.includes(mark))

describe("an event command that throws", () => {
    it("still lets the timer be scheduled and stored", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;reminder]")

        assert.ok(await marked(`${TimerEvent.timerStart}-reached`), "the event command never ran to throw")
        assert.ok(harness.client.timeouts.has("reminder"), "the timer was never armed")
        assert.ok(await Database.get(TimerKind.timeout, "reminder"), "the timer was never stored")
    })

    it("still lets a timeout run and forget itself", async () => {
        await run(harness, "$setTimeout[$testMark[ran];50;quick]")

        assert.ok(await waitFor(() => marks.includes("ran")), "the timer never ran")
        assert.ok(await marked(`${TimerEvent.timerFire}-reached`), "the event command never ran to throw")
        assert.ok(
            await waitFor(async () => (await Database.get(TimerKind.timeout, "quick")) === null),
            "the record outlived the run"
        )
    })

    it("still lets an interval keep ticking", async () => {
        await run(harness, "$setInterval[$testMark[tick];50;beat]")

        assert.ok(await waitFor(() => marks.filter((mark) => mark === "tick").length >= 3), "the interval stopped")
    })

    it("still lets a timer be cancelled", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;reminder]")
        assert.equal(await run(harness, "$clearTimeout[reminder]"), "true")

        assert.ok(await marked(`${TimerEvent.timerCancel}-reached`), "the event command never ran to throw")
        assert.equal(harness.client.timeouts.has("reminder"), false)
        assert.equal(await Database.get(TimerKind.timeout, "reminder"), null)
    })
})
