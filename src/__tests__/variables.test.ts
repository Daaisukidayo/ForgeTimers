import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marked, marks, persist, run, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./harness"

let harness: TestHarness

useHarness((booted) => (harness = booted))

/** What a tick wrote down, in the order the ticks ran */
const ticks = () => marks.filter((mark) => mark.startsWith("saw:"))

describe("what a timer writes to its own variables", () => {
    it("never reaches the script that scheduled it", async () => {
        await run(
            harness,
            "$let[note;before]$setTimeout[$let[note;after]$testMark[saw:$get[note]];40;t]$testMark[outer:$get[note]]"
        )

        assert.ok(await marked("saw:after"), "a timer has to see its own write")
        assert.ok(marks.includes("outer:before"), `the write escaped into the scheduling script: ${marks}`)
    })

    it("never reaches the next tick of an interval", async () => {
        await run(harness, "$let[note;before]$setInterval[$testMark[saw:$get[note]]$let[note;after];50;beat]")

        assert.ok(await waitFor(() => ticks().length >= 3), "the interval never ticked enough to tell")
        assert.deepEqual(ticks().slice(0, 3), ["saw:before", "saw:before", "saw:before"], "a tick inherited a write")
    })

    it("never reaches the row the timer is stored in", async () => {
        await run(harness, "$let[note;before]$setInterval[$testMark[saw:$get[note]]$let[note;after];50;beat]")
        assert.ok(await waitFor(() => ticks().length >= 2))

        const row = await Database.get(TimerKind.interval, "beat")
        assert.equal(row!.vars!.keywords!.note, "before", "the stored snapshot was written over by a tick")
    })

    it("never reaches the next tick after a restart either", async () => {
        const beat = new Timer({
            name: "beat",
            kind: TimerKind.interval,
            code: "$testMark[saw:$get[note]]$let[note;after]",
            duration: 50,
            channelID: "chan-1",
            vars: { keywords: { note: "before" }, environment: {}, localFunctions: {} },
        })
        beat.version = Timer.SCHEMA_VERSION
        await persist(beat, Date.now() + 50)

        await harness.ready()

        assert.ok(await waitFor(() => ticks().length >= 3), "the restored interval never ticked enough to tell")
        assert.deepEqual(ticks().slice(0, 3), ["saw:before", "saw:before", "saw:before"], "a tick inherited a write")

        const row = await Database.get(TimerKind.interval, "beat")
        assert.equal(row!.vars!.keywords!.note, "before", "the stored snapshot was written over by a tick")
    })
})
