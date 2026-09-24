import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marks, run, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./support/harness"
import { nextRun } from "../functions/cron"

let harness: TestHarness

useHarness((booted) => (harness = booted))

/** Every second. A test watches it come round without waiting on a wall clock. */
const EVERY_SECOND = "* * * * * *"

/** A per-second cron last due `secondsAgo` back, with that many to catch up on. */
function overdueCron(name: string, secondsAgo: number) {
    const timer = new Timer({
        name,
        kind: TimerKind.cron,
        code: "$testMark[caught-up]",
        cron: EVERY_SECOND,
        channelID: "chan-1",
    })

    timer.fireAt = Date.now() - secondsAgo * 1000
    return timer
}

describe("$setCron", () => {
    it("stores the expression rather than a duration", async () => {
        await run(harness, "$setCron[$testMark[ran];0 9 * * 1-5;daily]")

        const row = (await Database.get(TimerKind.cron, "daily"))!
        assert.ok(row, "no row was written")
        assert.equal(row.cron, "0 9 * * 1-5")
        assert.equal(row.duration, 0, "a cron keeps no gap")
        assert.ok(row.fireAt > Date.now(), "its first run has to come from the expression")
    })

    it("reads the expression in the zone it was given", async () => {
        await run(harness, "$setCron[x;0 9 * * *;moscow;Europe/Moscow]")
        await run(harness, "$setCron[x;0 9 * * *;utc;UTC]")

        const moscow = (await Database.get(TimerKind.cron, "moscow"))!
        const utc = (await Database.get(TimerKind.cron, "utc"))!

        assert.equal(moscow.timezone, "Europe/Moscow")
        assert.notEqual(moscow.fireAt, utc.fireAt, "09:00 in Moscow is not 09:00 in UTC")
    })

    it("falls back to the context's zone when the slot is left empty, not to a zone named nothing", async () => {
        await run(harness, "$setCron[x;0 9 * * *;blank;;false]")

        const row = await Database.get(TimerKind.cron, "blank")
        assert.ok(row, "leaving the zone out to reach a later argument threw the whole call away")
        assert.equal(row.timezone, "UTC", "an unnamed zone has to be written down, or a rehost moves the cron")
    })

    it("refuses an expression it cannot read, before anything is stored", async () => {
        await run(harness, "$setCron[x;not a cron;bad]")

        assert.equal(await Database.get(TimerKind.cron, "bad"), null, "a bad expression must not reach the database")
        assert.equal(await run(harness, "$timerExists[cron;bad]"), "false")
    })

    it("runs on the expression, and keeps running", async () => {
        await run(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`)

        assert.ok(await waitFor(() => marks.length >= 2, 4000), `it ticked ${marks.length} times`)
    })

    it("moves its own deadline on rather than drifting", async () => {
        await run(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`)
        const first = (await Database.get(TimerKind.cron, "beat"))!.fireAt

        assert.ok(await waitFor(() => marks.length >= 1, 3000), "it never ticked")
        await waitFor(async () => ((await Database.get(TimerKind.cron, "beat"))?.fireAt ?? 0) > first, 3000)

        const next = (await Database.get(TimerKind.cron, "beat"))!.fireAt
        assert.ok(next > first, "the stored deadline never moved")
        assert.equal((next - first) % 1000, 0, "it landed off the expression's own beat")
    })
})

describe("reading a cron back", () => {
    it("hands back the expression and the zone it was given", async () => {
        await run(harness, "$setCron[x;0 9 * * 1-5;daily;Europe/Moscow]")

        assert.equal(await run(harness, "$getTimer[cron;daily;cron]"), "0 9 * * 1-5")
        assert.equal(await run(harness, "$getTimer[cron;daily;timezone]"), "Europe/Moscow")
    })

    it("says nothing for a timeout, which keeps to a gap and has no expression", async () => {
        await run(harness, "$setTimeout[x;1h;later]")

        assert.equal(await run(harness, "$getTimer[timeout;later;cron]"), "")
        assert.equal(await run(harness, "$getTimer[timeout;later;timezone]"), "")
    })
})

describe("a cron across a change of the clocks", () => {
    const ZONE = "America/New_York"

    /** The zone's own clock at each of the next few occurrences. */
    const localRuns = (expression: string, from: string, count = 3) => {
        const hits: string[] = []
        let at = Date.parse(from)

        for (let i = 0; i < count; i++) {
            at = nextRun(expression, at, ZONE)
            hits.push(new Date(at).toLocaleString("sv-SE", { timeZone: ZONE }))
        }

        return hits
    }

    it("runs the hour the clocks skip over, rather than missing that day", () => {
        // new york jumps 02:00 to 03:00 on this date, there is no 2am
        assert.deepEqual(localRuns("0 2 * * *", "2027-03-13T12:00:00Z"), [
            "2027-03-14 03:00:00",
            "2027-03-15 02:00:00",
            "2027-03-16 02:00:00",
        ])
    })

    it("runs the hour the clocks repeat only once", () => {
        // 01:00 comes round twice on this date, and a daily cron is due on one of them
        assert.deepEqual(localRuns("0 1 * * *", "2027-11-06T12:00:00Z"), [
            "2027-11-07 01:00:00",
            "2027-11-08 01:00:00",
            "2027-11-09 01:00:00",
        ])
    })

    it("keeps to the wall clock either side, which is the whole point of a zone", () => {
        const spring = localRuns("0 9 * * *", "2027-03-12T12:00:00Z", 4)

        assert.ok(
            spring.every((at) => at.endsWith("09:00:00")),
            `nine in the morning drifted: ${spring}`
        )
    })
})

describe("$clearCron", () => {
    it("stops it and forgets the row", async () => {
        await run(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`)
        assert.equal(await run(harness, "$clearCron[beat]"), "true")

        assert.equal(await Database.get(TimerKind.cron, "beat"), null)
        assert.equal(await run(harness, "$timerExists[cron;beat]"), "false")

        marks.length = 0
        assert.equal(await waitFor(() => marks.length > 0, 1500), false, "a cleared cron kept ticking")
    })

    it("says no for a name nothing was scheduled under", async () => {
        assert.equal(await run(harness, "$clearCron[never]"), "false")
    })
})

describe("a cron across a restart", () => {
    it("is picked back up and keeps its expression", async () => {
        await Database.set(
            new Timer({
                name: "daily",
                kind: TimerKind.cron,
                code: "$testMark[ran]",
                cron: "0 9 * * *",
                timezone: "UTC",
                channelID: "chan-1",
            })
        )

        await harness.ready()

        assert.equal(await run(harness, "$timerRunning[cron;daily]"), "true", "it was never re-armed")
        assert.equal((await Database.get(TimerKind.cron, "daily"))!.cron, "0 9 * * *")
    })

    it("is thrown away when its expression no longer reads, rather than throwing on its first tick", async () => {
        const stored = new Timer({
            name: "rotten",
            kind: TimerKind.cron,
            code: "$testMark[ran]",
            cron: "0 9 * * *",
            channelID: "chan-1",
        })

        // only a hand-edited row or a stricter parser gets here, and it used to reach advance()
        stored.cron = "garbage"
        await Database.set(stored)

        await harness.ready()

        assert.equal(await Database.get(TimerKind.cron, "rotten"), null, "an unreadable cron must be dropped")
        assert.equal(await run(harness, "$timerExists[cron;rotten]"), "false")
    })

    it("is thrown away when its expression is missing, rather than spinning on a zero gap", async () => {
        const hollow = new Timer({ name: "hollow", kind: TimerKind.timeout, duration: 0, channelID: "chan-1" })
        hollow.kind = TimerKind.cron
        hollow.id = Timer.idOf(TimerKind.cron, "hollow")
        await Database.set(hollow)

        await harness.ready()

        assert.equal(await Database.get(TimerKind.cron, "hollow"), null, "a cron with no expression must be dropped")
        assert.equal(await run(harness, "$timerExists[cron;hollow]"), "false")
    })

    it("replays nothing by default", async () => {
        await Database.set(overdueCron("quiet", 10))
        await harness.ready()

        assert.deepEqual(marks, [], "restoredTicksLimit defaults to 0")
        assert.equal(await run(harness, "$timerRunning[cron;quiet]"), "true", "but it still resumes")
    })

    it("replays what it slept through, up to the limit", async () => {
        harness.ext.options.cronConfig = { restoredTicksLimit: 3 }
        await Database.set(overdueCron("busy", 10))

        await harness.ready()

        assert.ok(await waitFor(() => marks.length >= 3, 3000), `replayed ${marks.length} of the 3 allowed`)
        assert.equal(marks.length, 3, `it ran past its limit: ${marks.length}`)
    })

    it("replays on the limit its own call set, over whatever cronConfig says", async () => {
        harness.ext.options.cronConfig = { restoredTicksLimit: 0 }

        const timer = overdueCron("busy", 10)
        timer.config = { restoredTicksLimit: 2 }
        await Database.set(timer)

        await harness.ready()

        assert.ok(await waitFor(() => marks.length >= 2, 3000), `the config's 0 won: replayed ${marks.length}`)
        assert.equal(marks.length, 2, `it ran past its own limit: ${marks.length}`)
    })

    it("counts no further than the limit, however long it was down", async () => {
        // a per-second expression a day behind is 86400 occurrences, walk only up to the limit
        const day = overdueCron("ancient", 86_400)

        const started = Date.now()

        // one past the limit tells the caller there were more than it will run
        assert.equal(day.missedTicks(2), 3, "it counted past what anything would replay")
        assert.ok(Date.now() - started < 500, "counting took long enough to be walking the whole day")
    })

    it("comes back on its next occurrence after a pause, not on what was left of a gap", async () => {
        await run(harness, "$setCron[x;0 9 * * *;daily;UTC]")
        const due = (await Database.get(TimerKind.cron, "daily"))!.fireAt

        await run(harness, "$pauseTimer[cron;daily]")
        await run(harness, "$resumeTimer[cron;daily]")

        const woken = (await Database.get(TimerKind.cron, "daily"))!.fireAt
        assert.equal(new Date(woken).getUTCHours(), 9, `it woke at ${new Date(woken).toISOString()}, not at 09:00`)
        assert.equal(woken, due, "nothing moved on, so it should still be the same occurrence")
    })

    it("refuses a duration, since a gap is not a schedule it could keep", async () => {
        await run(harness, "$setCron[x;0 9 * * *;daily;UTC]")
        const due = (await Database.get(TimerKind.cron, "daily"))!.fireAt

        assert.notEqual(await run(harness, "$rescheduleTimer[cron;daily;30m]"), "true")
        assert.equal((await Database.get(TimerKind.cron, "daily"))!.fireAt, due, "its schedule was moved anyway")
    })

    it("takes a new expression, keeping everything it was scheduled with", async () => {
        await run(harness, "$setCron[$testMark[ran];0 9 * * *;daily;UTC]")
        const before = (await Database.get(TimerKind.cron, "daily"))!

        assert.equal(await run(harness, "$rescheduleTimer[cron;daily;0 17 * * *]"), "true")

        const after = (await Database.get(TimerKind.cron, "daily"))!
        assert.equal(after.cron, "0 17 * * *")
        assert.equal(new Date(after.fireAt).getUTCHours(), 17, "its next run did not come off the new expression")
        assert.equal(after.timezone, "UTC", "the zone it was given should survive being left out")
        assert.equal(after.code, before.code, "it was rebuilt instead of moved")
        assert.equal(after.channelID, before.channelID, "it lost the channel it answers in")
    })

    it("takes a new zone alongside the expression", async () => {
        await run(harness, "$setCron[x;0 9 * * *;daily;UTC]")

        assert.equal(await run(harness, "$rescheduleTimer[cron;daily;0 9 * * *;Europe/Moscow]"), "true")

        const moved = (await Database.get(TimerKind.cron, "daily"))!
        assert.equal(moved.timezone, "Europe/Moscow")
        assert.notEqual(new Date(moved.fireAt).getUTCHours(), 9, "09:00 in Moscow is not 09:00 in UTC")
    })

    it("refuses an expression it cannot read, leaving the old one alone", async () => {
        await run(harness, "$setCron[x;0 9 * * *;daily;UTC]")

        assert.notEqual(await run(harness, "$rescheduleTimer[cron;daily;not a cron]"), "true")
        assert.equal((await Database.get(TimerKind.cron, "daily"))!.cron, "0 9 * * *")
    })

    it("refuses one the manager is handed directly, without standing the cron down first", async () => {
        await run(harness, "$setCron[x;0 9 * * *;daily;UTC]")

        // the native checks too, only a direct caller reaches this guard
        assert.equal(await harness.ext.timersManager.rescheduleCron("daily", "garbage"), false)

        assert.equal((await Database.get(TimerKind.cron, "daily"))!.cron, "0 9 * * *")
        assert.equal(await run(harness, "$timerRunning[cron;daily]"), "true", "it was cancelled by a refused call")
    })

    it("can be paused and resumed like any other kind", async () => {
        await run(harness, `$setCron[$testMark[tick];${EVERY_SECOND};beat]`)

        assert.equal(await run(harness, "$pauseTimer[cron;beat]"), "true")
        assert.equal(await run(harness, "$getTimer[cron;beat;paused]"), "true")

        marks.length = 0
        assert.equal(await waitFor(() => marks.length > 0, 1500), false, "a paused cron kept ticking")

        assert.equal(await run(harness, "$resumeTimer[cron;beat]"), "true")
        assert.ok(await waitFor(() => marks.length > 0, 4000), "it never ticked again")
    })
})
