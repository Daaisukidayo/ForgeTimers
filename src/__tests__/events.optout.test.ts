import assert from "node:assert/strict"
import { after, before, describe, it } from "node:test"
import { boot, marks, run, waitFor } from "./harness"
import { TimerEvent } from "../types"

let harness: Awaited<ReturnType<typeof boot>>

before(async () => (harness = await boot()))

after(async () => {
    harness.disarm()
    await harness.cleanup()
})

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
