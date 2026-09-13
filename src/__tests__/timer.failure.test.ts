import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marks, persist, run, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./harness"

let harness: TestHarness

useHarness((booted) => (harness = booted))

const gone = (kind: TimerKind, name: string) => waitFor(async () => (await Database.get(kind, name)) === null)

describe("a timer whose own code throws", () => {
    it("forgets a live timeout that blew up", async () => {
        await run(harness, "$setTimeout[$testMark[reached]$testBoom;50;quick]")

        assert.ok(await waitFor(() => marks.includes("reached")), "the timer never ran")
        assert.ok(await gone(TimerKind.timeout, "quick"), "the record outlived the run")
        assert.equal(harness.client.timeouts.has("quick"), false)
    })

    it("forgets a restored timeout that blew up", async () => {
        await persist(
            new Timer({
                name: "back",
                kind: TimerKind.timeout,
                code: "$testMark[reached]$testBoom",
                duration: 1000,
                channelID: "chan-1",
            }),
            Date.now() - 100
        )

        await harness.ready()

        assert.ok(await waitFor(() => marks.includes("reached")), "the restored timer never ran")
        assert.ok(await gone(TimerKind.timeout, "back"), "the record outlived the run")
    })

    it("keeps a live interval ticking past the tick that blew up", async () => {
        await run(harness, "$setInterval[$testMark[tick]$testBoom;50;beat]")

        assert.ok(
            await waitFor(() => marks.filter((mark) => mark === "tick").length >= 3),
            "the interval stopped at the first error"
        )
        assert.ok(await Database.get(TimerKind.interval, "beat"), "and it kept its record")
    })

    it("keeps a restored interval ticking too", async () => {
        await persist(
            new Timer({
                name: "beat",
                kind: TimerKind.interval,
                code: "$testMark[tick]$testBoom",
                duration: 50,
                channelID: "chan-1",
            }),
            Date.now() + 50
        )

        await harness.ready()

        assert.ok(
            await waitFor(() => marks.filter((mark) => mark === "tick").length >= 3),
            "the restored interval stopped at the first error"
        )
    })
})
