import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import {
    apiError,
    Database,
    marked,
    marks,
    persist,
    run,
    TestHarness,
    Timer,
    TimerKind,
    useHarness,
    waitFor,
} from "./harness"
import { TimerEvent } from "../types"

let harness: TestHarness

useHarness((booted) => (harness = booted), {
    options: { events: Object.values(TimerEvent), timeoutConfig: { maxOverdue: 1000 } },
    setup: (booted) => {
        for (const event of Object.values(TimerEvent)) {
            booted.ext.commands.add({ type: event, code: `$testMark[${event}:$env[name]:$env[kind]]` })
        }

        booted.ext.commands.add({ type: TimerEvent.timerDrop, code: "$testMark[why:$env[reason]]" })
    },
})

const QUIET = 250

const droppedBecause = () => marks.find((mark) => mark.startsWith("why:"))?.slice("why:".length)

/** A row already past due when the restore reaches it, but inside the maxOverdue this suite boots with */
const overdue = (name: string, code = "$testMark[ran]", extra: Record<string, unknown> = {}) =>
    persist(
        new Timer({ name, kind: TimerKind.timeout, code, duration: 3_600_000, channelID: "chan-1", ...extra }),
        Date.now() - 100
    )

describe("a timer being scheduled", () => {
    it("reports the timer it just took on", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;reminder]")

        assert.ok(await marked(`${TimerEvent.timerStart}:reminder:timeout`))
    })

    it("reports an interval as an interval", async () => {
        await run(harness, "$setInterval[$testMark[ran];1h;beat]")

        assert.ok(await marked(`${TimerEvent.timerStart}:beat:interval`))
    })
})

describe("a timer going off", () => {
    it("reports a timeout that ran", async () => {
        await run(harness, "$setTimeout[$testMark[ran];50;quick]")

        assert.ok(await marked(`${TimerEvent.timerFire}:quick:timeout`))
    })

    it("reports every tick of an interval", async () => {
        await run(harness, "$setInterval[$testMark[tick];50;beat]")

        assert.ok(await waitFor(() => marks.filter((m) => m.startsWith(TimerEvent.timerFire)).length >= 2))
    })
})

describe("a timer being cancelled", () => {
    it("reports one that was running", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;reminder]")
        await run(harness, "$clearTimeout[reminder]")

        assert.ok(await marked(`${TimerEvent.timerCancel}:reminder:timeout`))
    })

    it("reports each one $wipeTimers took down", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;first]$setInterval[$testMark[tick];1h;second]")
        marks.length = 0

        await run(harness, "$wipeTimers")

        assert.ok(await marked(`${TimerEvent.timerCancel}:first:timeout`))
        assert.ok(await marked(`${TimerEvent.timerCancel}:second:interval`))
    })

    it("says nothing when there was nothing to cancel", async () => {
        await run(harness, "$clearTimeout[ghost]")

        assert.ok(!(await waitFor(() => marks.length > 0, QUIET)), `nothing was cancelled, yet: ${marks}`)
    })
})

describe("a restart", () => {
    it("reports what it picked back up", async () => {
        await persist(
            new Timer({
                name: "survivor",
                kind: TimerKind.timeout,
                code: "$testMark[ran]",
                duration: 3_600_000,
                channelID: "chan-1",
            })
        )

        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerRestore}:survivor:timeout`))
    })

    it("reports a timeout that came due while it was down as fired", async () => {
        const due = new Timer({
            name: "overdue",
            kind: TimerKind.timeout,
            code: "$testMark[ran]",
            duration: 500,
            channelID: "chan-1",
        })

        await persist(due, Date.now() - 100)
        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerRestore}:overdue:timeout`))
        assert.ok(await marked(`${TimerEvent.timerFire}:overdue:timeout`))
    })

    it("reports what it threw away, and why", async () => {
        const late = new Timer({
            name: "expired",
            kind: TimerKind.timeout,
            code: "$testMark[ran]",
            duration: 1000,
            channelID: "chan-1",
        })

        await persist(late, Date.now() - 60_000)
        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerDrop}:expired:timeout`))
        assert.ok(
            marks.some((mark) => mark.startsWith("why:") && mark.includes("overdue")),
            `the reason never reached the command: ${marks}`
        )
        assert.equal(await Database.get(TimerKind.timeout, "expired"), null)
    })
})

describe("the reason a timer was dropped", () => {
    const timeoutConfig = harness?.ext.options.timeoutConfig

    beforeEach(() => {
        harness.ext.options.timeoutConfig = timeoutConfig ?? { maxOverdue: 1000 }
        harness.ext.options.pruneUnknownGuilds = false
        harness.channelError = undefined
    })

    after(() => {
        harness.ext.options.timeoutConfig = timeoutConfig ?? { maxOverdue: 1000 }
        harness.ext.options.pruneUnknownGuilds = false
        harness.channelError = undefined
    })

    it("says the target is gone", async () => {
        await overdue("orphaned")
        harness.channelError = apiError(404, 10003, "Unknown Channel")

        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerDrop}:orphaned:timeout`))
        assert.match(droppedBecause() ?? "", /target is gone/)
    })

    it("says the code no longer compiles", async () => {
        await overdue("broken", "$if[")

        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerDrop}:broken:timeout`))
        assert.match(droppedBecause() ?? "", /compiles/)
    })

    it("says persist is off", async () => {
        harness.ext.options.timeoutConfig = { persist: false }
        await overdue("unwanted")

        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerDrop}:unwanted:timeout`))
        assert.match(droppedBecause() ?? "", /persist is off/)
    })

    it("says the guild is out of sight", async () => {
        harness.ext.options.pruneUnknownGuilds = true
        await overdue("elsewhere", "$testMark[ran]", { guildID: "g-gone" })

        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerDrop}:elsewhere:timeout`))
        assert.match(droppedBecause() ?? "", /not visible/)
    })
})

describe("a cancelled timer with no record behind it", () => {
    before(() => harness.ext.commands.add({ type: TimerEvent.timerCancel, code: "$testMark[left:$env[timeLeft]]" }))

    it("hands the command every property while the row is there", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;full]")
        await run(harness, "$clearTimeout[full]")

        assert.ok(await waitFor(() => marks.some((mark) => /^left:\d+$/.test(mark))), `no timeLeft: ${marks}`)
    })

    it("still reports one whose row is already gone, with nothing but its name", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;orphan]")
        await Database.delete(TimerKind.timeout, "orphan")
        marks.length = 0

        await run(harness, "$clearTimeout[orphan]")

        assert.ok(await marked(`${TimerEvent.timerCancel}:orphan:timeout`), "the cancel went unreported")
        assert.ok(await marked("left:"), `the payload carried more than the name: ${marks}`)
    })
})
