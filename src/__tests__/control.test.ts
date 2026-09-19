import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marks, run, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./support/harness"

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

    it("refuses a duration an interval could never tick on", async () => {
        await run(harness, "$setInterval[x;1h;beat]")
        await run(harness, "$rescheduleTimer[interval;beat;0]")

        assert.equal((await Database.get(TimerKind.interval, "beat"))!.duration, 3_600_000, "it must be untouched")
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
