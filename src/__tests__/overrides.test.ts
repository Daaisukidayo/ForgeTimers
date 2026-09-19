import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, GapKind, marks, persist, run, TestHarness, Timer, TimerKind, useHarness } from "./support/harness"
import { IIntervalConfig, IStoredOverrides, ITimeoutConfig } from "../types"

let harness: TestHarness

useHarness((booted) => (harness = booted))

function configure(timeoutConfig: ITimeoutConfig, intervalConfig: IIntervalConfig) {
    Object.assign(harness.ext.options, { timeoutConfig, intervalConfig })
}

const stored = (kind: GapKind, duration: number, dueIn: number, config: IStoredOverrides | null) =>
    persist(
        new Timer({ name: "n", kind, code: "$testMark[n]", duration, channelID: "chan-1", config }),
        Date.now() + dueIn
    )

describe("what a call records for itself", () => {
    it("keeps only the options it was given", async () => {
        await run(harness, "$setTimeout[x;1h;n;false]")

        const row = await Database.get(TimerKind.timeout, "n")
        assert.deepEqual(row!.config, { persist: false }, "maxOverdue was never passed, so it must not be stored")
    })

    it("stores nothing when the call names no options", async () => {
        await run(harness, "$setTimeout[x;1h;n]")

        const row = await Database.get(TimerKind.timeout, "n")
        assert.equal(row!.config, null)
    })

    it("reads a duration for maxOverdue the same way it reads the delay", async () => {
        await run(harness, "$setInterval[x;1h;n;;30m;5]")

        const row = await Database.get(TimerKind.interval, "n")
        assert.deepEqual(row!.config, { maxOverdue: 1_800_000, restoredTicksLimit: 5 })
    })

    it("records a cron's own options the same way an interval's", async () => {
        await run(harness, "$setCron[x;0 9 * * *;n;;;30m;5]")

        const row = await Database.get(TimerKind.cron, "n")
        assert.deepEqual(row!.config, { maxOverdue: 1_800_000, restoredTicksLimit: 5 })
    })

    it("writes Infinity as a string, which is the only way it survives JSON", async () => {
        await run(harness, "$setInterval[x;1h;n;;;Infinity]")

        const row = await Database.get(TimerKind.interval, "n")
        assert.equal(row!.config!.restoredTicksLimit, "Infinity", "as a number it would read back as null")
    })

    it("refuses a negative maxOverdue on a timeout", async () => {
        await run(harness, "$setTimeout[x;1h;n;;-1]")

        assert.equal(await Database.get(TimerKind.timeout, "n"), null, "nothing should have been scheduled")
        assert.equal(harness.client.timeouts.has("n"), false)
    })

    it("refuses a negative tick limit rather than silently replaying nothing", async () => {
        await run(harness, "$setInterval[x;1h;n;;;-1]")

        assert.equal(await Database.get(TimerKind.interval, "n"), null, "nothing should have been scheduled")
        assert.equal(harness.client.intervals.has("n"), false)
    })
})

describe("reading the options back", () => {
    it("hands $getTimer what the call spelled out", async () => {
        await run(harness, "$setInterval[x;1h;n;false;;Infinity]")
        const read = await run(harness, "$getTimer[interval;n;config]")

        assert.deepEqual(JSON.parse(`${read}`), { persist: false, restoredTicksLimit: "Infinity" })
    })

    it("reads as an empty object for a timer that named none", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        const read = await run(harness, "$getTimer[timeout;n;config]")

        assert.deepEqual(JSON.parse(`${read}`), {}, "config reads as an object, not as null")
    })
})

describe("which config wins on restore", () => {
    it("prefers the timer's own persist over the extension's", async () => {
        configure({ persist: true }, {})
        await stored(TimerKind.timeout, 3_600_000, 60_000, { persist: false })
        await harness.ready()

        assert.equal(await Database.get(TimerKind.timeout, "n"), null, "the timer opted out of being re-armed")
        assert.equal(harness.client.timeouts.has("n"), false)
    })

    it("falls back to the extension's config when the timer names nothing", async () => {
        configure({ persist: false }, {})
        await stored(TimerKind.timeout, 3_600_000, 60_000, null)
        await harness.ready()

        assert.equal(await Database.get(TimerKind.timeout, "n"), null, "the config said not to persist")
    })

    it("falls back to the default when neither names anything", async () => {
        configure({}, {})
        await stored(TimerKind.timeout, 3_600_000, 60_000, null)
        await harness.ready()

        assert.ok(await Database.get(TimerKind.timeout, "n"), "persist defaults to true")
        assert.equal(harness.client.timeouts.has("n"), true)
    })

    it("prefers the timer's own maxOverdue over the extension's", async () => {
        // the config would have kept this one, its own limit throws it away
        configure({ maxOverdue: 3_600_000 }, {})
        await stored(TimerKind.timeout, 3_600_000, -60_000, { maxOverdue: 1000 })
        await harness.ready()

        assert.deepEqual(marks, [], "it was past its own limit, so it must not have run")
        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
    })

    it("prefers the timer's own maxOverdue on an interval, which skips the tick instead of dropping it", async () => {
        // the config would have replayed the missed ticks, its own limit makes them all stale
        configure({}, { maxOverdue: 3_600_000, restoredTicksLimit: Infinity })
        await stored(TimerKind.interval, 10_000, -35_000, { maxOverdue: 1000 })

        const restoredAt = Date.now()
        await harness.ready()

        assert.deepEqual(marks, [], "the stale ticks must be skipped, not replayed")
        assert.equal(harness.client.intervals.has("n"), true, "an interval past maxOverdue resumes, it is not dropped")

        const row = await Database.get(TimerKind.interval, "n")
        assert.ok(row!.fireAt > restoredAt, "the schedule was moved forward")
    })

    it("prefers the timer's own persist on an interval", async () => {
        configure({}, { persist: true })
        await stored(TimerKind.interval, 10_000, 60_000, { persist: false })
        await harness.ready()

        assert.equal(await Database.get(TimerKind.interval, "n"), null, "the interval opted out of being re-armed")
        assert.equal(harness.client.intervals.has("n"), false)
    })

    it("prefers the timer's own restoredTicksLimit over the extension's", async () => {
        configure({}, { restoredTicksLimit: 0 })
        await stored(TimerKind.interval, 10_000, -35_000, { restoredTicksLimit: 2 })
        await harness.ready()

        assert.equal(marks.length, 2, `the config said replay nothing, the timer said 2, got ${marks.length}`)
    })

    it("still reads the extension's config for what the timer left out", async () => {
        // only persist is spelled out, so the tick limit must still come from the config
        configure({}, { restoredTicksLimit: 3 })
        await stored(TimerKind.interval, 10_000, -35_000, { persist: true })
        await harness.ready()

        assert.equal(marks.length, 3, `expected the config's 3 ticks, got ${marks.length}`)
    })

    it("replays every missed tick for a timer that stored Infinity", async () => {
        configure({}, { restoredTicksLimit: 0 })
        await stored(TimerKind.interval, 10_000, -35_000, { restoredTicksLimit: "Infinity" })
        await harness.ready()

        assert.equal(marks.length, 4, `the stored string must read back as Infinity, replayed ${marks.length}`)
    })
})
