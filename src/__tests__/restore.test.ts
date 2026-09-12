import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marks, persist, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./harness"
import { snapshotVars } from "../functions/snapshotVars"
import { IIntervalConfig, ITimeoutConfig } from "../types"

let harness: TestHarness

useHarness((booted) => (harness = booted))

function configure(timeoutConfig: ITimeoutConfig, intervalConfig: IIntervalConfig) {
    Object.assign(harness.ext.options, { timeoutConfig, intervalConfig })
}

const stored = (kind: TimerKind, duration: number, dueIn: number, name = "n") =>
    persist(new Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" }), Date.now() + dueIn)

describe("restoring timeouts", () => {
    it("re-arms one that is not due yet and keeps its record", async () => {
        await stored(TimerKind.timeout, 3_600_000, 60_000)
        await harness.ready()

        assert.deepEqual(marks, [], "it is not due, it must not fire")
        assert.equal(harness.client.timeouts.has("n"), true)
        assert.ok(await Database.get(TimerKind.timeout, "n"))
    })

    it("fires one that came due while the app was down, then forgets it", async () => {
        await stored(TimerKind.timeout, 3_600_000, -60_000)
        await harness.ready()

        assert.deepEqual(marks, ["n"])
        assert.equal(await Database.get(TimerKind.timeout, "n"), null, "a fired timeout is spent")
    })

    it("discards one that is later than maxOverdue allows, without running it", async () => {
        configure({ maxOverdue: 10_000 }, {})
        await stored(TimerKind.timeout, 3_600_000, -60_000)
        await harness.ready()

        assert.deepEqual(marks, [], "too late to be worth running")
        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
    })

    it("measures lateness against the due time, not the downtime", async () => {
        configure({ maxOverdue: 10_000 }, {})
        await stored(TimerKind.timeout, 90 * 24 * 60 * 60 * 1000, 60_000)
        await harness.ready()

        assert.ok(await Database.get(TimerKind.timeout, "n"), "a timer due later is never overdue")
        assert.equal(harness.client.timeouts.has("n"), true)
    })

    it("drops stored timers when persist is off", async () => {
        configure({ persist: false }, {})
        await stored(TimerKind.timeout, 3_600_000, 60_000)
        await harness.ready()

        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
        assert.equal(harness.client.timeouts.has("n"), false)
    })
})

describe("restoring intervals", () => {
    it("replays nothing by default", async () => {
        await stored(TimerKind.interval, 10_000, -35_000)
        await harness.ready()

        assert.deepEqual(marks, [], "restoredTicksLimit defaults to 0")
        assert.equal(harness.client.intervals.has("n"), true, "but the schedule still resumes")
    })

    it("replays every missed tick at -1", async () => {
        configure({}, { restoredTicksLimit: -1 })
        await stored(TimerKind.interval, 10_000, -35_000)
        await harness.ready()

        assert.equal(marks.length, 4, `expected 4 missed ticks, replayed ${marks.length}`)
        assert.equal(harness.client.intervals.has("n"), true)
    })

    it("replays at most the configured number", async () => {
        configure({}, { restoredTicksLimit: 2 })
        await stored(TimerKind.interval, 10_000, -35_000)
        await harness.ready()

        assert.equal(marks.length, 2)
    })

    it("resumes on the time left rather than a whole fresh tick", { timeout: 60_000 }, async () => {
        await stored(TimerKind.interval, 30_000, 5_000)
        await harness.ready()

        const fired = await waitFor(() => marks.length >= 1, 20_000)
        assert.ok(fired, "the tick was five seconds away, not 30s")
    })

    it("skips a stale tick past maxOverdue and carries on", async () => {
        configure({}, { maxOverdue: 1000, restoredTicksLimit: -1 })
        await stored(TimerKind.interval, 60_000, -60_000)

        const restoredAt = Date.now()
        await harness.ready()

        assert.deepEqual(marks, [], "the stale tick is skipped, not replayed")
        assert.equal(harness.client.intervals.has("n"), true)

        const row = await Database.get(TimerKind.interval, "n")
        assert.ok(row!.fireAt > restoredAt, "the schedule was moved forward")
    })
})

describe("the stored schema", () => {
    it("leaves a row written by a newer build alone", async () => {
        const timer = await stored(TimerKind.timeout, 3_600_000, -60_000)
        timer.version = Timer.SCHEMA_VERSION + 1
        await Database.set(timer)

        await harness.ready()

        assert.deepEqual(marks, [], "it must not be read with the wrong rules")
        assert.ok(await Database.get(TimerKind.timeout, "n"), "nor thrown away")
    })

    it("reads a row from before the schema as plain json", async () => {
        const legacy = { $forge: "date", value: "not a date" }
        const timer = new Timer({
            name: "n",
            kind: TimerKind.timeout,
            code: "$testMark[$env[cfg]]",
            duration: 1000,
            channelID: "chan-1",
        })
        timer.version = null
        timer.vars = { keywords: {}, environment: { cfg: legacy }, localFunctions: {} }
        await persist(timer, Date.now() - 1000)

        await harness.ready()

        assert.deepEqual(
            marks,
            [JSON.stringify(legacy, null, 4)],
            "a row written before the envelope existed must not be read as one"
        )
    })

    it("carries a date through the database and back", async () => {
        const when = new Date("2026-08-27T12:00:00.000Z")
        const timer = new Timer({
            name: "n",
            kind: TimerKind.timeout,
            code: "$testMark[$env[when]]",
            duration: 1000,
            channelID: "chan-1",
            vars: snapshotVars({ keywords: {}, environment: { when }, localFunctions: {} }, "test"),
        })
        await persist(timer, Date.now() - 1000)

        await harness.ready()

        assert.deepEqual(
            marks,
            [JSON.stringify(when)],
            "a Date renders quoted, a plain iso string renders bare and a raw envelope renders as an object"
        )
    })

    // nothing can write this kind today: the row stands in for one a later build adds
    it("leaves a kind this build has no map for alone", async () => {
        const future = new Timer({
            name: "later",
            kind: "cron" as never,
            code: "$testMark[later]",
            duration: 1000,
            channelID: "chan-1",
        })
        await persist(future, Date.now() - 1000)
        await stored(TimerKind.timeout, 1000, -1000)

        await harness.ready()

        assert.ok(await waitFor(() => marks.includes("n")), "one unreadable row stopped the rest of the boot")
        assert.deepEqual(marks, ["n"], "a kind with no map behind it must not be run")

        assert.equal(harness.client.timeouts.has("later"), false)
        assert.equal(harness.client.intervals.has("later"), false)
        assert.ok(await Database.get("cron" as never, "later"), "the row was thrown away rather than left alone")
    })
})
