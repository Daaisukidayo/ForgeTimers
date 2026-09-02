import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import { boot, Database, marks, persist, run, Timer, TimerKind } from "./harness"

let harness: Awaited<ReturnType<typeof boot>>

before(async () => (harness = await boot()))
beforeEach(async () => {
    harness.disarm()
    await Database.wipe()
    marks.length = 0
})
after(async () => {
    harness.disarm()
    await harness.cleanup()
})

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
        assert.equal(row!.hostID, "user-9")
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
        assert.deepEqual(await manager.stop(TimerKind.timeout, "both"), [true, true])

        await persist(
            new Timer({ name: "stored", kind: TimerKind.timeout, duration: 1000, channelID: "chan-1" }),
            Date.now() + 60_000
        )
        assert.deepEqual(await manager.stop(TimerKind.timeout, "stored"), [false, true])

        assert.deepEqual(await manager.stop(TimerKind.timeout, "neither"), [false, false])
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
})
