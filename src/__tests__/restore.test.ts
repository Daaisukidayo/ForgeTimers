import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import { DiscordAPIError } from "discord.js"
import { boot, Database, marks, persist, Timer, TimerKind } from "./harness"
import { snapshotVars } from "../functions/snapshotVars"
import { IIntervalConfig, ITimeoutConfig } from "../types"

let harness: Awaited<ReturnType<typeof boot>>

before(async () => {
    harness = await boot()
    harness.channels.set("chan-1", { id: "chan-1" })
})

beforeEach(async () => {
    harness.disarm()
    await Database.wipe()
    marks.length = 0
    harness.channelError = undefined
    harness.guilds.clear()
    harness.commands = []
    harness.fetches.channels = 0
    configure({}, {})
})

after(async () => {
    harness.disarm()
    await harness.cleanup()
})

function configure(timeoutConfig: ITimeoutConfig, intervalConfig: IIntervalConfig) {
    Object.assign(harness.ext.options, { timeoutConfig, intervalConfig, pruneUnknownGuilds: false })
}

const stored = (kind: TimerKind, duration: number, dueIn: number, name = "n") =>
    persist(
        new Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" }),
        Date.now() + dueIn
    )

const apiError = (status: number, code: number, message: string) =>
    new DiscordAPIError({ message, code } as never, code, status, "GET", "/channels/x", {})

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
        await stored(TimerKind.interval, 1000, -3500)
        await harness.ready()

        assert.deepEqual(marks, [], "restoredTicksLimit defaults to 0")
        assert.equal(harness.client.intervals.has("n"), true, "but the schedule still resumes")
    })

    it("replays every missed tick at -1", async () => {
        configure({}, { restoredTicksLimit: -1 })
        await stored(TimerKind.interval, 1000, -3500)
        await harness.ready()

        assert.equal(marks.length, 4, `expected 4 missed ticks, replayed ${marks.length}`)
        assert.equal(harness.client.intervals.has("n"), true)
    })

    it("replays at most the configured number", async () => {
        configure({}, { restoredTicksLimit: 2 })
        await stored(TimerKind.interval, 1000, -3500)
        await harness.ready()

        assert.equal(marks.length, 2)
    })

    it("resumes on the time left rather than a whole fresh tick", async () => {
        await stored(TimerKind.interval, 10_000, 200)
        await harness.ready()

        await new Promise((r) => setTimeout(r, 450))
        assert.deepEqual(marks, ["n"], "the tick was 200ms away, not 10s")
    })

    it("skips a stale tick past maxOverdue and carries on", async () => {
        configure({}, { maxOverdue: 1000, restoredTicksLimit: -1 })
        await stored(TimerKind.interval, 1000, -60_000)
        await harness.ready()

        assert.deepEqual(marks, [], "the stale tick is skipped, not replayed")
        assert.equal(harness.client.intervals.has("n"), true)

        const row = await Database.get(TimerKind.interval, "n")
        assert.ok(row!.fireAt > Date.now(), "the schedule was moved forward")
    })
})

describe("when a timer cannot be rebuilt", () => {
    it("keeps the record when discord is merely unreachable", async () => {
        for (const err of [
            apiError(500, 0, "Internal Server Error"),
            apiError(429, 0, "You are being rate limited"),
            apiError(403, 50001, "Missing Access"),
            new Error("getaddrinfo ENOTFOUND discord.com"),
        ]) {
            await Database.wipe()
            await stored(TimerKind.timeout, 3_600_000, -60_000)
            harness.channelError = err

            await harness.ready()
            assert.ok(
                await Database.get(TimerKind.timeout, "n"),
                `a timer was destroyed by a transient failure: ${(err as Error).message}`
            )
            assert.deepEqual(marks, [])
        }
    })

    it("drops the record once a due timer finds its channel gone", async () => {
        await stored(TimerKind.timeout, 3_600_000, -60_000)
        harness.channelError = apiError(404, 10003, "Unknown Channel")

        await harness.ready()
        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
    })

    it("drops the record when the code no longer compiles", async () => {
        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$if[", duration: 1000, channelID: "chan-1" }),
            Date.now() + 60_000
        )
        await harness.ready()
        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
    })

    it("stops an interval whose target turns out to be gone", async () => {
        await stored(TimerKind.interval, 60, -1000)
        harness.channelError = apiError(404, 10003, "Unknown Channel")

        await harness.ready()
        await new Promise((r) => setTimeout(r, 300))

        assert.equal(await Database.get(TimerKind.interval, "n"), null)
        assert.equal(harness.client.intervals.has("n"), false)
    })
})

describe("rebuilding lazily", () => {
    it("touches nothing at boot for a timer that is not due", async () => {
        for (let i = 0; i < 20; i++) await stored(TimerKind.timeout, 3_600_000, 60_000, `t${i}`)

        harness.fetches.channels = 0
        await harness.ready()

        assert.equal(harness.fetches.channels, 0, "a boot must not cost a request per stored timer")
        assert.equal(harness.client.timeouts.size, 20, "they are still armed")
        assert.equal((await Database.getAll()).length, 20)
    })

    it("keeps a distant timer whose channel is already gone", async () => {
        await stored(TimerKind.timeout, 3_600_000, 60_000)
        harness.channelError = apiError(404, 10003, "Unknown Channel")

        await harness.ready()
        assert.ok(await Database.get(TimerKind.timeout, "n"), "it is not due, so nothing was asked of discord yet")
    })

    it("resolves the target once, not on every tick", async () => {
        await stored(TimerKind.interval, 60, -1000)

        harness.fetches.channels = 0
        await harness.ready()
        await new Promise((r) => setTimeout(r, 350))
        harness.disarm()

        assert.ok(marks.length >= 3, `only ${marks.length} ticks ran`)
        assert.equal(harness.fetches.channels, 1, `resolved ${harness.fetches.channels} times`)
    })
})

describe("timers with no channel", () => {
    it("restores and runs one scheduled outside of a channel", async () => {
        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[ready]", duration: 1000 }),
            Date.now() - 1000
        )

        harness.fetches.channels = 0
        await harness.ready()

        assert.deepEqual(marks, ["ready"], "a clientReady timer must survive a restart like any other")
        assert.equal(harness.fetches.channels, 0, "there is no channel to ask for")
        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
    })

    it("keeps ticking an interval that has no channel", async () => {
        await persist(
            new Timer({ name: "n", kind: TimerKind.interval, code: "$testMark[tick]", duration: 60 }),
            Date.now() - 1000
        )

        await harness.ready()
        await new Promise((r) => setTimeout(r, 300))
        harness.disarm()

        assert.ok(marks.length >= 3, `only ${marks.length} ticks ran`)
        assert.equal(harness.fetches.channels, 0)
    })

    it("is not affected by a channel outage", async () => {
        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[ready]", duration: 1000 }),
            Date.now() - 1000
        )
        harness.channelError = apiError(500, 0, "Internal Server Error")

        await harness.ready()
        assert.deepEqual(marks, ["ready"])
    })
})

describe("the command a timer came from", () => {
    it("is handed back to the restored run", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/remind.js" } }]

        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[$commandName]", duration: 1000,
                channelID: "chan-1", path: "/commands/remind.js", commandName: "remind" }),
            Date.now() - 1000
        )
        await harness.ready()

        assert.deepEqual(marks, ["remind"], "$commandName must read the same command it did when scheduled")
    })

    it("is matched by name when the file has moved", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/moved.js" } }]

        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[$commandName]", duration: 1000,
                channelID: "chan-1", path: "/commands/remind.js", commandName: "remind" }),
            Date.now() - 1000
        )
        await harness.ready()

        assert.deepEqual(marks, ["remind"])
    })

    it("is left null when the command is gone", async () => {
        harness.commands = []

        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[gone:$commandName]", duration: 1000,
                channelID: "chan-1", path: "/commands/removed.js", commandName: "removed" }),
            Date.now() - 1000
        )
        await harness.ready()

        assert.deepEqual(marks, ["gone:"], "a missing command must not stop the timer from running")
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
        const timer = new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[$env[cfg]]",
            duration: 1000, channelID: "chan-1" })
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
        const timer = new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[$env[when]]",
            duration: 1000, channelID: "chan-1",
            vars: snapshotVars({ keywords: {}, environment: { when }, localFunctions: {} }, "test") })
        await persist(timer, Date.now() - 1000)

        await harness.ready()

        assert.deepEqual(
            marks,
            [JSON.stringify(when)],
            "a Date renders quoted, a plain iso string renders bare and a raw envelope renders as an object"
        )
    })
})

describe("ownership across processes", () => {
    it("leaves a timer whose guild this process cannot see", async () => {
        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[n]", duration: 1000,
                channelID: "chan-1", guildID: "guild-elsewhere" }),
            Date.now() + 60_000
        )
        await harness.ready()

        assert.ok(await Database.get(TimerKind.timeout, "n"), "another shard's timer is not ours to delete")
        assert.equal(harness.client.timeouts.has("n"), false, "nor ours to run")
    })

    it("prunes it only when asked to", async () => {
        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[n]", duration: 1000,
                channelID: "chan-1", guildID: "guild-elsewhere" }),
            Date.now() + 60_000
        )
        Object.assign(harness.ext.options, { pruneUnknownGuilds: true })
        await harness.ready()

        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
    })

    it("restores a timer whose guild this process can see", async () => {
        harness.guilds.add("guild-mine")
        await persist(
            new Timer({ name: "n", kind: TimerKind.timeout, code: "$testMark[n]", duration: 1000,
                channelID: "chan-1", guildID: "guild-mine" }),
            Date.now() + 60_000
        )
        await harness.ready()

        assert.equal(harness.client.timeouts.has("n"), true)
    })
})
