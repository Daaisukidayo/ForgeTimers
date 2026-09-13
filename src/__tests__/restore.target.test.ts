import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { apiError, Database, marks, persist, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./harness"

let harness: TestHarness

useHarness((booted) => (harness = booted))

const stored = (kind: TimerKind, duration: number, dueIn: number, name = "n") =>
    persist(new Timer({ name, kind, code: `$testMark[${name}]`, duration, channelID: "chan-1" }), Date.now() + dueIn)

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
        await waitFor(async () => (await Database.get(TimerKind.interval, "n")) === null)

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

        const reached = await waitFor(() => marks.length >= 3)
        harness.disarm()

        assert.ok(reached, `only ${marks.length} ticks ran`)
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

        const reached = await waitFor(() => marks.length >= 3)
        harness.disarm()

        assert.ok(reached, `only ${marks.length} ticks ran`)
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
    it("is looked up once, not on every tick", async () => {
        harness.commands = [{ data: { name: "reminder", path: "/commands/reminder.js" } }]
        await persist(
            new Timer({
                name: "beat",
                kind: TimerKind.interval,
                code: "$testMark[tick]",
                duration: 50,
                channelID: "chan-1",
                path: "/commands/reminder.js",
            }),
            Date.now() + 50
        )

        await harness.ready()
        assert.ok(await waitFor(() => marks.filter((mark) => mark === "tick").length >= 3), "the interval never ticked")

        assert.equal(harness.fetches.commands, 1, `scanned the command list ${harness.fetches.commands} times`)
    })

    it("is handed back to the restored run", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/remind.js" } }]

        await persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[$commandName]",
                duration: 1000,
                channelID: "chan-1",
                path: "/commands/remind.js",
                commandName: "remind",
            }),
            Date.now() - 1000
        )
        await harness.ready()

        assert.deepEqual(marks, ["remind"], "$commandName must read the same command it did when scheduled")
    })

    it("is matched by name when the file has moved", async () => {
        harness.commands = [{ name: "remind", data: { name: "remind", path: "/commands/moved.js" } }]

        await persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[$commandName]",
                duration: 1000,
                channelID: "chan-1",
                path: "/commands/remind.js",
                commandName: "remind",
            }),
            Date.now() - 1000
        )
        await harness.ready()

        assert.deepEqual(marks, ["remind"])
    })

    it("is left null when the command is gone", async () => {
        harness.commands = []

        await persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[gone:$commandName]",
                duration: 1000,
                channelID: "chan-1",
                path: "/commands/removed.js",
                commandName: "removed",
            }),
            Date.now() - 1000
        )
        await harness.ready()

        assert.deepEqual(marks, ["gone:"], "a missing command must not stop the timer from running")
    })
})

describe("the message a timer was scheduled from", () => {
    const withMessage = (messageID: string) =>
        persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[$authorID]",
                duration: 1000,
                channelID: "chan-msg",
                messageID,
                hostID: "user-1",
            }),
            Date.now() - 1000
        )

    beforeEach(() => {
        harness.channels.set("chan-msg", {
            id: "chan-msg",
            messages: { fetch: async (id: string) => (id === "msg-1" ? { id, author: { id: "author-1" } } : null) },
        })
    })

    it("is fetched again and becomes the target", async () => {
        await withMessage("msg-1")
        await harness.ready()
        await waitFor(() => marks.length > 0)

        assert.deepEqual(marks, ["author-1"], "the run should see the original author")
    })

    it("falls back to the channel once the message is gone", async () => {
        harness.users.set("user-1", { id: "user-1" })
        await withMessage("msg-gone")
        await harness.ready()
        await waitFor(() => marks.length > 0)

        assert.deepEqual(marks, ["user-1"], "a deleted message must not cost the timer its run")
    })
})

describe("the user who scheduled a timer", () => {
    const hosted = (guildID: string | null = null) =>
        persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[$authorID]",
                duration: 1000,
                channelID: "chan-1",
                hostID: "user-1",
                guildID,
            }),
            Date.now() - 1000
        )

    it("stands in as the author when the target has none", async () => {
        harness.users.set("user-1", { id: "user-1" })
        await hosted()
        await harness.ready()
        await waitFor(() => marks.length > 0)

        assert.deepEqual(marks, ["user-1"])
    })

    it("is looked up as a member when the timer belongs to a guild", async () => {
        harness.guilds.add("guild-1")
        harness.users.set("user-1", { id: "user-1" })
        harness.members.set("user-1", { id: "user-1", nickname: "host" })

        await hosted("guild-1")
        await harness.ready()
        await waitFor(() => marks.length > 0)

        assert.deepEqual(marks, ["user-1"])
    })

    it("leaves the run without an author when the user is gone", async () => {
        await hosted()
        await harness.ready()
        await waitFor(() => marks.length > 0, 2000)

        assert.deepEqual(marks, [""], "a deleted user must not stop the timer running")
    })
})
