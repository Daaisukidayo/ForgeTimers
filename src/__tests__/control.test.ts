import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marks, persist, run, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./support/harness"

let harness: TestHarness

useHarness((booted) => (harness = booted))

const stored = (name: string, duration: number, code = "$testMark[ran]") =>
    new Timer({ name, kind: TimerKind.timeout, code, duration, channelID: "chan-1" })

describe("$rescheduleTimer", () => {
    it("moves the deadline and keeps everything else", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;n]")
        const before = (await Database.get(TimerKind.timeout, "n"))!

        assert.equal(await run(harness, "$rescheduleTimer[timeout;n;30m]"), "true")

        const after = (await Database.get(TimerKind.timeout, "n"))!
        assert.equal(after.duration, 1_800_000)
        assert.ok(after.fireAt < before.fireAt, "the deadline was not brought forward")
        assert.equal(after.code, before.code, "the code it runs must not change")
        assert.equal(after.timestamp, before.timestamp, "it is the same timer, not a new one")
        assert.equal(harness.client.timeouts.has("n"), true, "it must still be armed")
    })

    it("runs on the new deadline rather than the old one", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;n]")
        await run(harness, "$rescheduleTimer[timeout;n;60]")

        assert.ok(await waitFor(() => marks.includes("ran"), 3000), "it never fired on the shorter wait")
    })

    it("says no for a name nothing was scheduled under", async () => {
        assert.equal(await run(harness, "$rescheduleTimer[timeout;never;1h]"), "false")
    })

    it("takes any duration the set natives would take", async () => {
        await run(harness, "$setInterval[$testMark[tick];1h;beat]")
        assert.equal(await run(harness, "$rescheduleTimer[interval;beat;0]"), "true")

        const ticked = await waitFor(() => marks.filter((mark) => mark === "tick").length >= 2, 2000)
        harness.disarm()

        assert.ok(ticked, "the new schedule was never armed")
        assert.equal((await Database.get(TimerKind.interval, "beat"))!.duration, 0, "it is stored as it was given")
    })

    it("still refuses a schedule it cannot read at all", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;n]")

        assert.notEqual(
            await run(harness, "$rescheduleTimer[timeout;n;banana]"),
            "true",
            "it reported a move it never made"
        )
        assert.ok(!(await waitFor(() => marks.includes("ran"), 300)), "an unreadable schedule fired the timer at once")
        assert.ok(await Database.get(TimerKind.timeout, "n"), "and then spent its record")
    })
})

describe("$pauseTimer and $resumeTimer", () => {
    it("stops a timeout from firing, and keeps its record", async () => {
        await run(harness, "$setTimeout[$testMark[ran];200;n]")
        assert.equal(await run(harness, "$pauseTimer[timeout;n]"), "true")

        assert.equal(harness.client.timeouts.has("n"), false, "nothing may stay armed")
        assert.ok(await Database.get(TimerKind.timeout, "n"), "the record has to survive the pause")
        assert.equal(await waitFor(() => marks.includes("ran"), 600), false, "a paused timeout must not fire")
    })

    it("keeps what was left of the wait rather than the wall clock", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        await run(harness, "$pauseTimer[timeout;n]")

        const paused = (await Database.get(TimerKind.timeout, "n"))!
        assert.ok(paused.isPaused())
        assert.ok(paused.timeLeft() > 3_599_000, `time left froze at ${paused.timeLeft()}ms`)
        assert.equal(paused.isOverdue(), false, "a paused timer never falls behind")
    })

    it("starts it again from where it was left", async () => {
        await run(harness, "$setTimeout[$testMark[ran];400;n]")
        await run(harness, "$pauseTimer[timeout;n]")

        const left = (await Database.get(TimerKind.timeout, "n"))!.timeLeft()
        assert.equal(await run(harness, "$resumeTimer[timeout;n]"), "true")

        const resumed = (await Database.get(TimerKind.timeout, "n"))!
        assert.equal(resumed.pausedAt, null)
        assert.ok(Math.abs(resumed.timeLeft() - left) < 100, "it did not pick the wait back up where it stopped")
        assert.ok(await waitFor(() => marks.includes("ran"), 3000), "it never fired after being resumed")
    })

    it("stops an interval ticking, and starts it again", async () => {
        await run(harness, "$setInterval[$testMark[tick];100;beat]")
        assert.ok(await waitFor(() => marks.length >= 1, 2000), "it never ticked to begin with")

        await run(harness, "$pauseTimer[interval;beat]")
        const ticked = marks.length

        assert.equal(await waitFor(() => marks.length > ticked, 400), false, "a paused interval must not tick")

        await run(harness, "$resumeTimer[interval;beat]")
        assert.ok(await waitFor(() => marks.length > ticked, 3000), "it never ticked again")
    })

    it("is the one way a script can tell a paused timer from a missing one", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        assert.equal(await run(harness, "$getTimer[timeout;n;paused]"), "false")

        await run(harness, "$pauseTimer[timeout;n]")

        assert.equal(await run(harness, "$getTimer[timeout;n;paused]"), "true")
        assert.equal(await run(harness, "$timerExists[timeout;n]"), "true", "it is still a timer, just a held one")
        assert.equal(await run(harness, "$timerRunning[timeout;n]"), "false", "which is the pair's whole point")
        assert.equal(await run(harness, "$getAllTimers[timeout;paused;,]"), "true", "and it lists like any other")
    })

    it("refuses to pause twice, or to resume something running", async () => {
        await run(harness, "$setTimeout[x;1h;n]")

        assert.equal(await run(harness, "$resumeTimer[timeout;n]"), "false", "it was never paused")
        assert.equal(await run(harness, "$pauseTimer[timeout;n]"), "true")
        assert.equal(await run(harness, "$pauseTimer[timeout;n]"), "false", "it is already on hold")
    })

    it("says no for a name nothing was scheduled under", async () => {
        assert.equal(await run(harness, "$pauseTimer[timeout;never]"), "false")
        assert.equal(await run(harness, "$resumeTimer[interval;never]"), "false")
    })

    it("stays paused across a restart, and is not armed by it", async () => {
        const n = stored("n", 200)
        n.pausedAt = Date.now()
        await Database.set(n)

        await harness.ready()

        assert.equal(harness.client.timeouts.has("n"), false, "a paused timer must not be re-armed on startup")
        assert.ok(await Database.get(TimerKind.timeout, "n"), "nor dropped")
        assert.equal(await waitFor(() => marks.includes("ran"), 500), false, "nor run, however overdue it looks")
    })

    it("can be resumed after that restart", async () => {
        const n = stored("n", 300)
        n.pausedAt = Date.now()
        await Database.set(n)

        await harness.ready()
        assert.equal(await run(harness, "$resumeTimer[timeout;n]"), "true")

        assert.ok(await waitFor(() => marks.includes("ran"), 3000), "the rebuilt run never fired")
    })

    it("leaves a paused timer paused when rescheduled, with the whole new wait ahead", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        await run(harness, "$pauseTimer[timeout;n]")
        await run(harness, "$rescheduleTimer[timeout;n;30m]")

        const moved = (await Database.get(TimerKind.timeout, "n"))!
        assert.ok(moved.isPaused(), "rescheduling must not wake it")
        assert.ok(Math.abs(moved.timeLeft() - 1_800_000) < 1000, `it has ${moved.timeLeft()}ms left, not the new 30m`)
        assert.equal(harness.client.timeouts.has("n"), false, "and nothing may be armed for it")
    })
})

describe("$executeTimer", () => {
    it("runs the stored code without spending the timer", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;n]")
        const due = (await Database.get(TimerKind.timeout, "n"))!.fireAt

        assert.equal(await run(harness, "$executeTimer[timeout;n]"), "true")
        assert.ok(await waitFor(() => marks.includes("ran"), 2000), "the stored code never ran")

        const after = (await Database.get(TimerKind.timeout, "n"))!
        assert.equal(after.fireAt, due, "its deadline moved")
        assert.equal(harness.client.timeouts.has("n"), true, "it was stood down by being run by hand")
    })

    it("runs an interval's code without moving it on a tick", async () => {
        await run(harness, "$setInterval[$testMark[tick];1h;beat]")
        const due = (await Database.get(TimerKind.interval, "beat"))!.fireAt

        assert.equal(await run(harness, "$executeTimer[interval;beat]"), "true")
        assert.ok(await waitFor(() => marks.includes("tick"), 2000), "the stored code never ran")

        assert.equal((await Database.get(TimerKind.interval, "beat"))!.fireAt, due, "a hand run counted as a tick")
    })

    it("says no for a name nothing was stored under", async () => {
        assert.equal(await run(harness, "$executeTimer[timeout;never]"), "false")
    })

    it("runs a paused timer too, since a hold is about its schedule and not about asking", async () => {
        await run(harness, "$setTimeout[$testMark[ran];1h;n]")
        await run(harness, "$pauseTimer[timeout;n]")

        assert.equal(await run(harness, "$executeTimer[timeout;n]"), "true")
        assert.ok(await waitFor(() => marks.includes("ran"), 2000), "a hold stopped a run that was asked for")

        assert.equal(await run(harness, "$getTimer[timeout;n;paused]"), "true", "and it is still on hold after")
    })

    it("tells the two kinds apart under one name", async () => {
        await run(harness, "$setTimeout[$testMark[from-timeout];1h;n]")
        await run(harness, "$setInterval[$testMark[from-interval];1h;n]")

        await run(harness, "$executeTimer[interval;n]")

        assert.ok(await waitFor(() => marks.includes("from-interval"), 2000), "it ran the wrong one")
        assert.ok(!marks.includes("from-timeout"), "it ran both")
    })
})

describe("$findTimer", () => {
    it("returns only what matches, as whole timers", async () => {
        await run(harness, "$setTimeout[x;1h;here]")
        await Database.set(new Timer({ name: "elsewhere", kind: TimerKind.timeout, duration: 1000, channelID: "c2" }))

        const found = JSON.parse((await run(harness, "$findTimer[channelID;chan-1]")) as string)

        assert.equal(found.length, 1, `it matched ${found.length}`)
        assert.equal(found[0].name, "here")
        assert.equal(found[0].kind, "timeout", "a match carries the whole timer, not just the matched field")
    })

    it("needs every pair to match, not just one of them", async () => {
        await run(harness, "$setTimeout[x;1h;a]")
        await run(harness, "$setInterval[x;1h;b]")

        const both = JSON.parse((await run(harness, "$findTimer[channelID;chan-1;kind;interval]")) as string)

        assert.deepEqual(
            both.map((timer: { name: string }) => timer.name),
            ["b"]
        )
    })

    it("matches an object against its json", async () => {
        await run(harness, "$setTimeout[x;1h;n;false]")

        const found = JSON.parse((await run(harness, '$findTimer[config;{"persist":false}]')) as string)
        assert.equal(found.length, 1, `matching config as json found ${found.length}`)
    })

    it("matches an empty value against a property the kind does not carry", async () => {
        await run(harness, "$setTimeout[x;1h;plain]")
        await run(harness, "$setCron[x;0 9 * * *;daily]")

        const gapped = JSON.parse((await run(harness, "$findTimer[cron;]")) as string)

        assert.deepEqual(
            gapped.map((timer: { name: string }) => timer.name),
            ["plain"],
            "only the timer with no expression should read as empty"
        )
    })

    it("returns an empty list when nothing matches", async () => {
        await run(harness, "$setTimeout[x;1h;n]")

        assert.equal(await run(harness, "$findTimer[name;missing]"), "[]")
    })

    it("refuses a pair that was left without its value", async () => {
        await run(harness, "$setTimeout[x;1h;n]")

        const said = await run(harness, "$findTimer[kind;timeout;channelID]")
        assert.notEqual(said, "[]", "an odd filter must not quietly match on the pairs it did get")
    })

    it("refuses to hand back everything when asked for nothing", async () => {
        await run(harness, "$setTimeout[x;1h;n]")

        assert.notEqual(await run(harness, "$findTimer[]"), "[]", "a filterless call must not read as a match of none")
    })
})

describe("a timer reading itself", () => {
    it("knows its own name and kind while it runs", async () => {
        await run(harness, "$setTimeout[$testMark[me:$timerData[name]:$timerData[kind]];50;mine]")

        assert.ok(await waitFor(() => marks.includes("me:mine:timeout"), 3000), `it saw ${marks}`)
    })

    it("reads the same on every tick of an interval", async () => {
        await run(harness, "$setInterval[$testMark[beat:$timerData[name]];60;drum]")

        assert.ok(await waitFor(() => marks.filter((m) => m === "beat:drum").length >= 2, 3000), `it saw ${marks}`)
    })

    it("reads its expression back after a restart", async () => {
        await Database.set(
            new Timer({
                name: "daily",
                kind: TimerKind.cron,
                code: "$testMark[on:$timerData[cron]]",
                cron: "* * * * * *",
                timezone: "UTC",
                channelID: "chan-1",
            })
        )

        await harness.ready()

        assert.ok(await waitFor(() => marks.includes("on:* * * * * *"), 4000), `a restored cron saw ${marks}`)
    })

    it("says nothing for an unnamed timer, which has no record to read", async () => {
        await run(harness, "$setTimeout[$testMark[loose:<$timerData[name]>];50]")

        assert.ok(await waitFor(() => marks.includes("loose:<>"), 3000), `it saw ${marks}`)
    })
})

describe("$clearTimer", () => {
    it("cancels any kind under one name, telling them apart", async () => {
        await run(harness, "$setTimeout[$testMark[t];1h;n]")
        await run(harness, "$setInterval[$testMark[i];1h;n]")

        assert.equal(await run(harness, "$clearTimer[interval;n]"), "true")

        assert.equal(await run(harness, "$timerExists[interval;n]"), "false")
        assert.equal(await run(harness, "$timerExists[timeout;n]"), "true", "it took the wrong one")
    })

    it("cancels a cron, which the kind-specific ones cannot be asked for generically", async () => {
        await run(harness, "$setCron[x;0 9 * * *;daily]")

        assert.equal(await run(harness, "$clearTimer[cron;daily]"), "true")
        assert.equal(await run(harness, "$timerExists[cron;daily]"), "false")
    })

    it("says no for a name nothing was scheduled under", async () => {
        assert.equal(await run(harness, "$clearTimer[timeout;never]"), "false")
    })
})

describe("$clearTimers", () => {
    it("cancels every match and counts them, leaving the rest alone", async () => {
        await run(harness, "$setTimeout[x;1h;a]")
        await run(harness, "$setTimeout[x;1h;b]")
        await Database.set(new Timer({ name: "elsewhere", kind: TimerKind.timeout, duration: 1000, channelID: "c2" }))

        assert.equal(await run(harness, "$clearTimers[channelID;chan-1]"), "2")

        assert.equal(await run(harness, "$timerExists[timeout;a]"), "false")
        assert.equal(await run(harness, "$timerExists[timeout;b]"), "false")
        assert.equal(await run(harness, "$timerExists[timeout;elsewhere]"), "true", "it reached past its filter")
    })

    it("takes the same pairs $findTimer does", async () => {
        await run(harness, "$setTimeout[x;1h;a]")
        await run(harness, "$setInterval[x;1h;b]")

        assert.equal(await run(harness, "$clearTimers[channelID;chan-1;kind;interval]"), "1")
        assert.equal(await run(harness, "$timerExists[timeout;a]"), "true", "only the interval was asked for")
    })

    it("counts none when nothing matches, and refuses a pair without its value", async () => {
        await run(harness, "$setTimeout[x;1h;n]")

        assert.equal(await run(harness, "$clearTimers[name;missing]"), "0")
        assert.notEqual(await run(harness, "$clearTimers[kind;timeout;channelID]"), "1", "an odd filter still cleared")
        assert.equal(await run(harness, "$timerExists[timeout;n]"), "true", "and it took something anyway")
    })
})

describe("$timersCount", () => {
    it("counts what is stored, of one kind or of all of them", async () => {
        await run(harness, "$setTimeout[x;1h;a]")
        await run(harness, "$setInterval[x;1h;b]")
        await run(harness, "$setCron[x;0 9 * * *;c]")

        assert.equal(await run(harness, "$timersCount"), "3")
        assert.equal(await run(harness, "$timersCount[interval]"), "1")
        assert.equal(await run(harness, "$timersCount[cron]"), "1")
    })

    it("counts a paused timer, which is stored like any other", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        await run(harness, "$pauseTimer[timeout;n]")

        assert.equal(await run(harness, "$timersCount[timeout]"), "1")
    })

    it("is zero when nothing is stored", async () => {
        assert.equal(await run(harness, "$timersCount"), "0")
    })
})

describe("a context a native cloned", () => {
    it("still knows its timer, the way $scope and the await natives clone one", async () => {
        await run(harness, "$setTimeout[$testMark[out=$timerData[name]|in=$scope[$timerData[name]]];60;probe]")

        assert.ok(await waitFor(() => marks.length > 0, 2000), "it never ran")
        assert.equal(marks[0], "out=probe|in=probe", "a cloned context left the run without its timer")
    })
})

describe("standing every timer down", () => {
    it("lets go of every name without touching what is stored", async () => {
        await run(harness, "$setTimeout[x;1h;a]$setInterval[x;1h;b]$setCron[x;0 9 * * *;c]")

        const manager = harness.ext.timersManager
        assert.equal(manager.isLive(TimerKind.timeout, "a"), true, "nothing was armed to stand down")

        manager.standDown()

        for (const [kind, name] of [
            [TimerKind.timeout, "a"],
            [TimerKind.interval, "b"],
            [TimerKind.cron, "c"],
        ] as const) {
            assert.equal(manager.isLive(kind, name), false, `the ${kind} is still live`)
            assert.ok(await Database.get(kind, name), `the ${kind} lost its record, which is what wipe is for`)
        }

        assert.equal(harness.client.timeouts.size, 0)
        assert.equal(harness.client.intervals.size, 0)
    })
})

describe("a stored timer whose code will not compile", () => {
    // only something besides $setTimeout can store this, the outer command compiles first
    const broken = (name: string) =>
        persist(new Timer({ name, kind: TimerKind.timeout, code: "$if[", duration: 3_600_000 }), Date.now() + 3_600_000)

    it("is refused a new schedule, and left where it was", async () => {
        await broken("n")
        const before = (await Database.get(TimerKind.timeout, "n"))!

        assert.equal(await run(harness, "$rescheduleTimer[timeout;n;30m]"), "false")
        assert.equal((await Database.get(TimerKind.timeout, "n"))!.fireAt, before.fireAt, "it was moved anyway")
    })

    it("is refused a release, and stays held", async () => {
        await broken("n")

        assert.equal(await run(harness, "$pauseTimer[timeout;n]"), "true", "a hold asks nothing of the compiler")
        assert.equal(await run(harness, "$resumeTimer[timeout;n]"), "false")
        assert.equal(await run(harness, "$getTimer[timeout;n;paused]"), "true")
    })

    it("is refused a run by hand", async () => {
        await broken("n")
        assert.equal(await run(harness, "$executeTimer[timeout;n]"), "false")
    })
})
