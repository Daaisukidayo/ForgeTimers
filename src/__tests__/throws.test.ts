import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marks, persist, run, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./support/harness"
import { TimerEvent } from "../types"
import { Logger } from "../functions/logger"

let harness: TestHarness

useHarness((booted) => (harness = booted))

/** Listens for an event, throws, and hands back whatever the logger was told while it did. */
async function withThrowingListener(event: TimerEvent, work: (failed: unknown[]) => Promise<void>) {
    const failed: unknown[] = []
    const error = Logger.error

    Logger.error = (...args: unknown[]) => void failed.push(args[0])

    harness.ext.emitter.on(event, () => {
        throw new Error("a listener blew up")
    })

    try {
        await work(failed)
    } finally {
        harness.ext.emitter.removeAllListeners(event)
        Logger.error = error
    }
}

describe("an event listener that throws", () => {
    it("leaves the timeout that reported to it spent, rather than fired and still stored", async () => {
        await withThrowingListener(TimerEvent.timerFire, async (failed) => {
            await run(harness, "$setTimeout[$testMark[ran];60;live]")

            assert.ok(await waitFor(() => marks.includes("ran"), 2000), "the timer never ran")
            assert.ok(await waitFor(() => failed.length > 0, 1000), "the throw was swallowed without a word")

            // with the record left behind it would be restored, and fire again, on the next boot
            assert.ok(
                await waitFor(async () => !(await Database.get(TimerKind.timeout, "live")), 1000),
                "the throw stopped the timeout from giving up its record"
            )
        })
    })

    it("leaves a run startup picked back up spent too", async () => {
        await withThrowingListener(TimerEvent.timerFire, async (failed) => {
            await persist(
                new Timer({ name: "late", kind: TimerKind.timeout, code: "$testMark[ran]", duration: 1000 }),
                Date.now() - 1000
            )

            await harness.ready()

            assert.ok(await waitFor(() => marks.includes("ran"), 2000), "the restored timer never ran")
            assert.ok(await waitFor(() => failed.length > 0, 1000), "the throw was swallowed without a word")
            assert.equal(await Database.get(TimerKind.timeout, "late"), null, "and it kept its record")
        })
    })

    it("does not turn the command that scheduled a timer into an error", async () => {
        await withThrowingListener(TimerEvent.timerStart, async (failed) => {
            const said = await run(harness, "$setTimeout[x;1h;n]")

            assert.notEqual(said, null, "the listener failed the command, though the timer was scheduled")
            assert.ok(failed.length > 0, "the throw was swallowed without a word")
            assert.ok(await Database.get(TimerKind.timeout, "n"))
        })
    })
})
