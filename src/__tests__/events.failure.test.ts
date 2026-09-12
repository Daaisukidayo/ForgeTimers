import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marked, marks, run, TestHarness, TimerKind, useHarness, waitFor } from "./harness"
import { TimerEvent } from "../types"

const WATCHED = [TimerEvent.timerStart, TimerEvent.timerFire, TimerEvent.timerCancel]

let harness: TestHarness

useHarness((booted) => (harness = booted), {
    options: { events: WATCHED },
    setup: (booted) => {
        for (const event of WATCHED) {
            booted.ext.commands.add({ type: event, code: `$testMark[${event}-reached]$testBoom` })
        }
    },
})

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
