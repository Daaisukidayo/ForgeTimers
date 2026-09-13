import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { marks, run, TestHarness, useHarness, waitFor } from "./harness"
import { TimerEvent } from "../types"

let harness: TestHarness

useHarness((booted) => (harness = booted))

describe("an extension that was not asked for events", () => {
    it("listens to none of them", () => {
        for (const event of Object.values(TimerEvent)) {
            assert.equal(harness.ext.emitter.listenerCount(event), 0, `${event} was armed without being asked for`)
        }
    })

    it("still runs the timers themselves", async () => {
        await run(harness, "$setTimeout[$testMark[ran];50;quick]")

        assert.ok(await waitFor(() => marks.includes("ran")))
        assert.deepEqual(marks, ["ran"], "an event slipped through")
    })
})
