import assert from "node:assert/strict"
import { before, describe, it } from "node:test"
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
} from "./support/harness"
import { TimerEvent } from "../types"

let harness: TestHarness

useHarness((booted) => (harness = booted), {
    options: { events: Object.values(TimerEvent), timeoutConfig: { maxOverdue: 1000 } },
    setup: (booted) => {
        for (const event of Object.values(TimerEvent)) {
            booted.ext.commands.add({ type: event, code: `$testMark[${event}:$timerData[name]:$timerData[kind]]` })
        }

        booted.ext.commands.add({ type: TimerEvent.timerDrop, code: "$testMark[why:$eventData[dropReason]]" })
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

describe("an event named as a plain string", () => {
    it("is listened to, and its command runs", async () => {
        harness.ext.commands.add({ type: "timerStart", code: "$testMark[from-a-string]" })

        await run(harness, "$setTimeout[$testMark[x];1h;plain]")

        assert.ok(await marked("from-a-string"), "a command registered with a string never ran")
    })
})

describe("startup finishing", () => {
    it("counts what it kept and what it threw away", async () => {
        harness.ext.commands.add({
            type: TimerEvent.timersReady,
            code: "$testMark[ready:$eventData[restored]:$eventData[dropped]]",
        })

        // inside the 1000ms maxOverdue this suite boots with, so it is kept
        await overdue("kept")
        // an hour past it, so it is discarded instead
        await persist(
            new Timer({ name: "stale", kind: TimerKind.timeout, code: "x", duration: 3_600_000, channelID: "chan-1" }),
            Date.now() - 3_600_000
        )

        await harness.ready()

        assert.ok(await marked("ready:1:1"), `wrong tally: ${marks.filter((mark) => mark.startsWith("ready:"))}`)
    })

    it("still fires when there was nothing stored at all", async () => {
        harness.ext.commands.add({
            type: TimerEvent.timersReady,
            code: "$testMark[ready:$eventData[restored]:$eventData[dropped]]",
        })

        await harness.ready()

        assert.ok(await marked("ready:0:0"), "a first boot has to reach the event too")
    })
})

describe("the options a timer carries", () => {
    it("reaches a listening command through $timerData", async () => {
        harness.ext.commands.add({ type: TimerEvent.timerStart, code: "$testMark[cfg:$timerData[config]]" })

        await run(harness, "$setInterval[$testMark[x];1h;beat;false;;5]")
        assert.ok(await waitFor(() => marks.some((mark) => mark.startsWith("cfg:"))), "no event carried the options")

        const cfg = marks.find((mark) => mark.startsWith("cfg:"))!.slice("cfg:".length)
        assert.deepEqual(JSON.parse(cfg), { persist: false, restoredTicksLimit: 5 })
    })
})

describe("holding a timer", () => {
    it("reports the hold and the release, each about its own timer", async () => {
        await run(harness, "$setTimeout[x;1h;held]")

        assert.equal(await run(harness, "$pauseTimer[timeout;held]"), "true")
        assert.ok(await marked(`${TimerEvent.timerPause}:held:timeout`), "pausing went unreported")

        assert.equal(await run(harness, "$resumeTimer[timeout;held]"), "true")
        assert.ok(await marked(`${TimerEvent.timerResume}:held:timeout`), "resuming went unreported")
    })

    it("reports nothing when there was nothing to hold or release", async () => {
        await run(harness, "$setTimeout[x;1h;running]")

        assert.equal(await run(harness, "$resumeTimer[timeout;running]"), "false", "it was never held")
        assert.equal(await run(harness, "$pauseTimer[timeout;missing]"), "false", "and this one does not exist")

        assert.ok(!marks.some((mark) => mark.startsWith(TimerEvent.timerResume)), `it said ${marks}`)
        assert.ok(!marks.some((mark) => mark.startsWith(TimerEvent.timerPause)), `it said ${marks}`)
    })
})

describe("$oldTimer and $newTimer", () => {
    it("show a tick moving the deadline on", async () => {
        harness.ext.commands.add({
            type: TimerEvent.timerFire,
            code: "$testMark[tick:$oldTimer[fireAt]:$newTimer[fireAt]]",
        })

        await run(harness, "$setInterval[x;60;beat]")

        assert.ok(await waitFor(() => marks.some((mark) => mark.startsWith("tick:"))), `nothing ticked: ${marks}`)

        const [, before, after] = marks.find((mark) => mark.startsWith("tick:"))!.split(":")
        assert.ok(Number(after) > Number(before), `the deadline did not move: ${before} then ${after}`)
        assert.equal(Number(after) - Number(before), 60, "it moved by something other than the tick length")
    })

    it("show a hold freezing the timer and a release starting it again", async () => {
        harness.ext.commands.add({
            type: TimerEvent.timerPause,
            code: "$testMark[held:$oldTimer[paused]:$newTimer[paused]]",
        })
        harness.ext.commands.add({
            type: TimerEvent.timerResume,
            code: "$testMark[freed:$oldTimer[paused]:$newTimer[paused]]",
        })

        await run(harness, "$setTimeout[x;1h;n]")

        await run(harness, "$pauseTimer[timeout;n]")
        assert.ok(await marked("held:false:true"), `the hold read wrong: ${marks}`)

        await run(harness, "$resumeTimer[timeout;n]")
        assert.ok(await marked("freed:true:false"), `the release read wrong: ${marks}`)
    })

    it("say nothing for an event that changed no timer", async () => {
        harness.ext.commands.add({
            type: TimerEvent.timerStart,
            code: "$testMark[fresh:<$oldTimer[name]>:$newTimer[name]]",
        })

        await run(harness, "$setTimeout[x;1h;born]")

        assert.ok(await marked("fresh:<>:born"), `a timer with no before read wrong: ${marks}`)
    })
})

describe("$timerData", () => {
    const readingWith = (code: string) => {
        harness.ext.commands.add({ type: TimerEvent.timerStart, code: `$testMark[read:${code}]` })
        return async () => {
            await run(harness, "$setTimeout[$testMark[x];1h;reminder]")
            await waitFor(() => marks.some((mark) => mark.startsWith("read:")))
            return marks.find((mark) => mark.startsWith("read:"))!.slice("read:".length)
        }
    }

    it("reads one property of the timer the event is about", async () => {
        assert.equal(
            await readingWith("$timerData[name]/$timerData[kind]/$timerData[channelID]")(),
            "reminder/timeout/chan-1"
        )
    })

    it("hands back every property at once when asked for none", async () => {
        const whole = JSON.parse(await readingWith("$timerData")())
        assert.equal(whole.name, "reminder")
        assert.equal(whole.kind, "timeout")
        assert.ok(whole.fireAt > Date.now(), "the deadline has to be carried too")
    })

    it("keeps the timer off the environment entirely", async () => {
        harness.ext.commands.add({ type: TimerEvent.timerStart, code: "$testMark[env:<$env[timer]>]" })

        await run(harness, "$setTimeout[$testMark[x];1h;reminder]")

        // it rides the context, so a command can never reach its code or its variable snapshot through $env
        assert.ok(await marked("env:<>"), `the timer leaked into the environment: ${marks}`)
    })

    it("reads the same inside a timer's own code as it does in an event", async () => {
        await run(harness, "$setTimeout[$testMark[self:$timerData[name]];60;mine]")

        assert.ok(await marked("self:mine"), `a timer could not read itself: ${marks}`)
    })

    it("keeps an event's own values out of the timer's names", async () => {
        harness.ext.commands.add({
            type: TimerEvent.timerDrop,
            code: "$testMark[both:$timerData[name]:$eventData[dropReason]]",
        })

        await persist(
            new Timer({ name: "expired", kind: TimerKind.timeout, code: "x", duration: 1000, channelID: "chan-1" }),
            Date.now() - 60_000
        )
        await harness.ready()

        assert.ok(
            await waitFor(() => marks.some((mark) => mark.startsWith("both:expired:") && mark.includes("overdue"))),
            `the timer and the reason must both come through: ${marks.filter((m) => m.startsWith("both:"))}`
        )
    })

    it("reads how late a restored timer was, alongside the timer itself", async () => {
        harness.ext.commands.add({
            type: TimerEvent.timerRestore,
            code: "$testMark[late:$timerData[name]:$eventData[overdueBy]]",
        })

        await overdue("tardy")
        await harness.ready()

        const seen = await waitFor(() => marks.some((mark) => /^late:tardy:\d+$/.test(mark)))
        assert.ok(seen, `no overdue reading came through: ${marks.filter((mark) => mark.startsWith("late:"))}`)
    })

    it("reads empty in an event that is about no single timer", async () => {
        harness.ext.commands.add({ type: TimerEvent.timersReady, code: "$testMark[noTimer:<$timerData[name]>]" })

        await harness.ready()

        assert.ok(await marked("noTimer:<>"), `timersReady carries no timer: ${marks}`)
    })
})

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

// harness.reset() already puts timeoutConfig, pruneUnknownGuilds and channelError back before every test
describe("the reason a timer was dropped", () => {
    it("says nothing about a gone target, because that one fires instead of dropping", async () => {
        await overdue("orphaned")
        harness.channelError = apiError(404, 10003, "Unknown Channel")

        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerFire}:orphaned:timeout`), "a missing channel stopped the run")
        assert.equal(droppedBecause(), undefined, `it was dropped after all: ${droppedBecause()}`)
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

    it("says the guild is not one this process is in", async () => {
        harness.ext.options.pruneUnknownGuilds = true
        await overdue("elsewhere", "$testMark[ran]", { guildID: "g-gone" })

        await harness.ready()

        assert.ok(await marked(`${TimerEvent.timerDrop}:elsewhere:timeout`))
        assert.match(droppedBecause() ?? "", /not one this process is in/)
    })
})

describe("a cancelled timer with no record behind it", () => {
    before(() =>
        harness.ext.commands.add({ type: TimerEvent.timerCancel, code: "$testMark[left:$timerData[timeLeft]]" })
    )

    it("hands the command every property while the row is there", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;full]")
        await run(harness, "$clearTimeout[full]")

        assert.ok(await waitFor(() => marks.some((mark) => /^left:\d+$/.test(mark))), `no timeLeft: ${marks}`)
    })

    it("still reports one whose row is already gone, by name alone", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;orphan]")
        await Database.delete(TimerKind.timeout, "orphan")
        marks.length = 0

        await run(harness, "$clearTimeout[orphan]")

        assert.ok(await marked(`${TimerEvent.timerCancel}:orphan:timeout`), "the cancel went unreported")
        // nothing was stored, so there is no schedule left to report: only which name went away is true
        assert.ok(await marked("left:0"), `it claimed to know a deadline it never read: ${marks}`)
    })
})
