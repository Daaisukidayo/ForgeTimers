import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, marks, persist, run, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./support/harness"
import { TimerProperty } from "../properties/timer"

let harness: TestHarness

useHarness((booted) => (harness = booted))

describe("$setTimeout", () => {
    it("persists a named timeout and arms it", async () => {
        await run(harness, "$setTimeout[$sendMessage[now];1h;reminder]")

        const row = await Database.get(TimerKind.timeout, "reminder")
        assert.ok(row, "no row was written")
        assert.equal(row.code, "$sendMessage[now]", "the raw code is what gets replayed")
        assert.equal(row.duration, 3_600_000)
        assert.equal(row.channelID, "chan-1")
        assert.equal(harness.client.timeouts.has("reminder"), true)
    })

    it("records where and by whom it was scheduled", async () => {
        await run(harness, "$setTimeout[x;1h;n]", {
            id: "msg-1",
            channel: { id: "chan-9" },
            guild: { id: "guild-9" },
            author: { id: "user-9" },
        })

        const row = await Database.get(TimerKind.timeout, "n")
        assert.equal(row!.channelID, "chan-9")
        assert.equal(row!.guildID, "guild-9")
        assert.equal(row!.authorID, "user-9")
    })

    it("leaves an unnamed timeout out of the database", async () => {
        await run(harness, "$setTimeout[x;1s]")
        assert.equal((await Database.getAll()).length, 0)
    })

    it("survives a duration past node's 32-bit cap", async () => {
        await run(harness, "$setTimeout[$testMark[distant];90d;distant]")

        const row = await Database.get(TimerKind.timeout, "distant")
        assert.equal(row!.duration, 90 * 24 * 60 * 60 * 1000)
        assert.ok(row!.timeLeft() > 89 * 24 * 60 * 60 * 1000, "it must not be due already")

        await new Promise((r) => setTimeout(r, 120))
        assert.deepEqual(marks, [], "a 90 day timeout ran immediately")
        assert.ok(await Database.get(TimerKind.timeout, "distant"), "and then deleted itself")
    })

    it("replaces a timer reused under the same name", async () => {
        await run(harness, "$setTimeout[first;1h;n]")
        await run(harness, "$setTimeout[second;2h;n]")

        assert.equal((await Database.getAll()).length, 1)
        const row = await Database.get(TimerKind.timeout, "n")
        assert.equal(row!.code, "second")
        assert.equal(row!.duration, 7_200_000)
    })

    it("refuses a name too long for the key column", async () => {
        await run(harness, `$setTimeout[x;1h;${"x".repeat(300)}]`)
        assert.equal((await Database.getAll()).length, 0, "an oversized name must not reach the database")
    })

    it("persists a named timer scheduled outside of a channel", async () => {
        await run(harness, "$setTimeout[x;1h;n]", {})

        const row = await Database.get(TimerKind.timeout, "n")
        assert.ok(row, "a clientReady command has no channel and must still be able to schedule")
        assert.equal(row.channelID, null)
        assert.equal(row.guildID, null)
        assert.equal(harness.client.timeouts.has("n"), true)
    })

    it("persists a named interval scheduled outside of a channel", async () => {
        await run(harness, "$setInterval[x;5m;n]", {})

        const row = await Database.get(TimerKind.interval, "n")
        assert.ok(row)
        assert.equal(row.channelID, null)
        assert.equal(harness.client.intervals.has("n"), true)
    })

    it("still allows an unnamed timer without a channel", async () => {
        const result = await run(harness, "$setTimeout[x;1s]", { channel: null })
        assert.notEqual(result, null, "an unnamed timer needs no channel, it is never restored")
    })
})

describe("$setInterval", () => {
    it("persists a named interval and arms it", async () => {
        await run(harness, "$setInterval[$sendMessage[tick];5m;pulse]")

        const row = await Database.get(TimerKind.interval, "pulse")
        assert.ok(row)
        assert.equal(row.kind, TimerKind.interval)
        assert.equal(row.duration, 300_000)
        assert.equal(harness.client.intervals.has("pulse"), true)
    })

    it("refuses a zero duration", async () => {
        await run(harness, "$setInterval[x;;n]")
        assert.equal((await Database.getAll()).length, 0)
        assert.equal(harness.client.intervals.size, 0, "a 0ms interval would be a busy loop")
    })
})

describe("$clearTimeout and $clearInterval", () => {
    it("cancels a timeout and forgets it", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        const result = await run(harness, "$clearTimeout[n]")

        assert.equal(result, "true")
        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
        assert.equal(harness.client.timeouts.has("n"), false)
    })

    it("cancels an interval and forgets it", async () => {
        await run(harness, "$setInterval[x;5m;n]")
        await run(harness, "$clearInterval[n]")

        assert.equal(await Database.get(TimerKind.interval, "n"), null)
        assert.equal(harness.client.intervals.has("n"), false)
    })

    it("reports false for a timer that was never running", async () => {
        assert.equal(await run(harness, "$clearTimeout[never]"), "false")
    })

    it("reports true for a timer that is stored but not running here", async () => {
        await persist(
            new Timer({ name: "elsewhere", kind: TimerKind.timeout, duration: 1000, channelID: "chan-1" }),
            Date.now() + 60_000
        )

        assert.equal(harness.client.timeouts.has("elsewhere"), false)
        assert.equal(await run(harness, "$clearTimeout[elsewhere]"), "true")
        assert.equal(await Database.get(TimerKind.timeout, "elsewhere"), null)
    })

    it("tells running apart from stored", async () => {
        const manager = harness.ext.timersManager

        await run(harness, "$setTimeout[x;1h;both]")
        assert.deepEqual(await manager.stop(TimerKind.timeout, "both"), { cleared: true, forgotten: true })

        await persist(
            new Timer({ name: "stored", kind: TimerKind.timeout, duration: 1000, channelID: "chan-1" }),
            Date.now() + 60_000
        )
        assert.deepEqual(await manager.stop(TimerKind.timeout, "stored"), { cleared: false, forgotten: true })

        assert.deepEqual(await manager.stop(TimerKind.timeout, "neither"), { cleared: false, forgotten: false })
    })
})

describe("a name used by both kinds at once", () => {
    it("cancels only the kind that was asked for", async () => {
        await run(harness, "$setTimeout[$testMark[t];1h;n]$setInterval[$testMark[i];1h;n]")
        assert.equal(await run(harness, "$clearTimeout[n]"), "true")

        assert.equal(harness.client.timeouts.has("n"), false)
        assert.equal(harness.client.intervals.has("n"), true, "the interval went down with the timeout")

        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
        assert.ok(await Database.get(TimerKind.interval, "n"), "the interval's row went with it")
    })

    it("wipes both", async () => {
        await run(harness, "$setTimeout[$testMark[t];1h;n]$setInterval[$testMark[i];1h;n]")

        assert.equal(await run(harness, "$wipeTimers"), "2")
        assert.equal(harness.client.timeouts.size, 0)
        assert.equal(harness.client.intervals.size, 0)
        assert.equal((await Database.getAll()).length, 0)
    })

    it("stands a cron down too, rather than leaving it armed", async () => {
        await run(harness, "$setTimeout[$testMark[t];1h;n]$setCron[$testMark[c];0 9 * * *;n]")

        assert.equal(await run(harness, "$wipeTimers"), "2", "the cron went uncounted")
        assert.equal(await run(harness, "$timerRunning[cron;n]"), "false", "the cron was left running")
        assert.equal((await Database.getAll()).length, 0)
    })
})

describe("reading timers back", () => {
    it("returns a single property", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        assert.equal(await run(harness, "$getTimer[timeout;n;duration]"), "3600000")
        assert.equal(await run(harness, "$getTimer[timeout;n;kind]"), "timeout")
        assert.equal(await run(harness, "$getTimer[timeout;n;channelID]"), "chan-1")
    })

    it("returns the whole timer as json without a property", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        const parsed = JSON.parse((await run(harness, "$getTimer[timeout;n]")) as string)
        assert.equal(parsed.id, "timeout:n")
        assert.equal(parsed.duration, 3_600_000)
    })

    it("carries the documented properties, and nothing kept for the extension itself", async () => {
        await run(harness, "$let[note;kept]$setTimeout[$get[note];1h;n]")

        const parsed = JSON.parse((await run(harness, "$getTimer[timeout;n]")) as string)
        const listed = JSON.parse((await run(harness, "$getAllTimers")) as string)[0]

        const documented = Object.values(TimerProperty).sort()
        assert.deepEqual(Object.keys(parsed).sort(), documented, "$getTimer drifted from the property list")
        assert.deepEqual(Object.keys(listed).sort(), documented, "$getAllTimers drifted from it too")

        assert.ok(parsed.timeLeft > 0, "timeLeft is a property, so json has to carry it")
        assert.deepEqual(parsed.args, [], "args reads as a list, not as null")
    })

    it("returns nothing for a timer that does not exist", async () => {
        assert.equal(await run(harness, "$getTimer[timeout;missing]"), "")
    })

    it("lists every timer, and filters by kind", async () => {
        await run(harness, "$setTimeout[x;1h;a]")
        await run(harness, "$setInterval[x;5m;b]")

        assert.equal(JSON.parse((await run(harness, "$getAllTimers")) as string).length, 2)
        assert.equal(JSON.parse((await run(harness, "$getAllTimers[interval]")) as string).length, 1)
        assert.equal(JSON.parse((await run(harness, "$getAllTimers[timeout]")) as string)[0].name, "a")
    })

    it("wipes everything and reports what was running", async () => {
        await run(harness, "$setTimeout[x;1h;a]")
        await run(harness, "$setInterval[x;5m;b]")

        assert.equal(await run(harness, "$wipeTimers"), "2")
        assert.equal((await Database.getAll()).length, 0)
        assert.equal(harness.client.timeouts.size, 0)
        assert.equal(harness.client.intervals.size, 0)
    })

    it("returns one property of every timer as a list", async () => {
        await run(harness, "$setInterval[x;5m;a]")
        await run(harness, "$setInterval[x;5m;b]")

        const listed = JSON.parse((await run(harness, "$getAllTimers[interval;name]")) as string)
        assert.deepEqual(listed.sort(), ["a", "b"], "a property without a separator stays a list")
    })

    it("joins that list only when given a separator", async () => {
        await run(harness, "$setInterval[x;5m;a]")
        await run(harness, "$setInterval[x;5m;b]")

        const joined = `${await run(harness, "$getAllTimers[interval;name;|]")}`
        assert.deepEqual(joined.split("|").sort(), ["a", "b"])
    })

    it("keeps a json property readable when joining", async () => {
        await run(harness, "$setTimeout[x;1h;a;false]")

        const joined = `${await run(harness, "$getAllTimers[timeout;config;|]")}`
        assert.equal(joined, '{"persist":false}', "an object must not join as [object Object]")
    })
})

describe("$timerRunning", () => {
    it("sees a running timer, and only of the kind asked for", async () => {
        await run(harness, "$setTimeout[x;1h;a]")

        assert.equal(await run(harness, "$timerRunning[timeout;a]"), "true")
        assert.equal(await run(harness, "$timerRunning[interval;a]"), "false", "the name is per kind")
    })

    it("says no once it has been cleared", async () => {
        await run(harness, "$setInterval[x;5m;beat]")
        assert.equal(await run(harness, "$timerRunning[interval;beat]"), "true")

        await run(harness, "$clearInterval[beat]")
        assert.equal(await run(harness, "$timerRunning[interval;beat]"), "false")
    })

    it("says no for a name nothing was ever scheduled under", async () => {
        assert.equal(await run(harness, "$timerRunning[timeout;never]"), "false")
    })

    it("answers from the live map, not from the database", async () => {
        await persist(new Timer({ name: "stored", kind: TimerKind.timeout, duration: 1000, channelID: "c" }))

        assert.ok(await Database.get(TimerKind.timeout, "stored"), "the row is there")
        assert.equal(await run(harness, "$timerRunning[timeout;stored]"), "false", "but nothing is armed under it")
    })

    it("says yes to a timer asking about itself, however that run was started", async () => {
        await run(harness, "$setTimeout[$testMark[live:$timerRunning[timeout;live]];50;live]")
        assert.ok(await waitFor(() => marks.includes("live:true"), 3000), `a fired timeout saw ${marks}`)

        marks.length = 0

        // a restored overdue run holds its name with nothing scheduled, and used to read as false
        await persist(
            new Timer({
                name: "late",
                kind: TimerKind.timeout,
                code: "$testMark[late:$timerRunning[timeout;late]]",
                duration: 1000,
                channelID: "chan-1",
            }),
            Date.now() - 100
        )

        await harness.ready()
        assert.ok(await waitFor(() => marks.includes("late:true"), 3000), `a restored run saw ${marks}`)
    })
})

describe("$timerExists", () => {
    it("counts a record nothing re-armed, which the other says no to", async () => {
        await persist(new Timer({ name: "stored", kind: TimerKind.timeout, duration: 1000, channelID: "c" }))

        assert.equal(await run(harness, "$timerExists[timeout;stored]"), "true")
        assert.equal(await run(harness, "$timerRunning[timeout;stored]"), "false", "the two are not the same question")
    })

    it("says no to one armed with no record, which is how a database outage leaves it", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        await Database.delete(TimerKind.timeout, "n")

        assert.equal(await run(harness, "$timerRunning[timeout;n]"), "true", "it is still armed")
        assert.equal(await run(harness, "$timerExists[timeout;n]"), "false", "but the two answer for one place each")
    })

    it("counts a paused timer, which is exactly the one the other says no to", async () => {
        await run(harness, "$setTimeout[x;1h;n]")
        await run(harness, "$pauseTimer[timeout;n]")

        assert.equal(await run(harness, "$timerExists[timeout;n]"), "true")
        assert.equal(await run(harness, "$timerRunning[timeout;n]"), "false")
    })

    it("says no once the record is gone, and only for the kind asked for", async () => {
        await run(harness, "$setTimeout[x;1h;a]")

        assert.equal(await run(harness, "$timerExists[timeout;a]"), "true")
        assert.equal(await run(harness, "$timerExists[interval;a]"), "false", "the name is per kind")

        await run(harness, "$clearTimeout[a]")
        assert.equal(await run(harness, "$timerExists[timeout;a]"), "false")
    })

    it("says no for a name nothing was ever scheduled under", async () => {
        assert.equal(await run(harness, "$timerExists[timeout;never]"), "false")
    })
})
