import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Database, persist, TestHarness, Timer, TimerKind, useHarness } from "./harness"

let harness: TestHarness

useHarness((booted) => (harness = booted))

describe("ownership across processes", () => {
    it("leaves a timer whose guild this process cannot see", async () => {
        await persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[n]",
                duration: 1000,
                channelID: "chan-1",
                guildID: "guild-elsewhere",
            }),
            Date.now() + 60_000
        )
        await harness.ready()

        assert.ok(await Database.get(TimerKind.timeout, "n"), "another shard's timer is not ours to delete")
        assert.equal(harness.client.timeouts.has("n"), false, "nor ours to run")
    })

    it("prunes it only when asked to", async () => {
        await persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[n]",
                duration: 1000,
                channelID: "chan-1",
                guildID: "guild-elsewhere",
            }),
            Date.now() + 60_000
        )
        Object.assign(harness.ext.options, { pruneUnknownGuilds: true })
        await harness.ready()

        assert.equal(await Database.get(TimerKind.timeout, "n"), null)
    })

    it("restores a timer whose guild this process can see", async () => {
        harness.guilds.add("guild-mine")
        await persist(
            new Timer({
                name: "n",
                kind: TimerKind.timeout,
                code: "$testMark[n]",
                duration: 1000,
                channelID: "chan-1",
                guildID: "guild-mine",
            }),
            Date.now() + 60_000
        )
        await harness.ready()

        assert.equal(harness.client.timeouts.has("n"), true)
    })
})

describe("a timer belonging to no guild", () => {
    const guildless = (name = "n") =>
        persist(
            new Timer({ name, kind: TimerKind.timeout, code: `$testMark[${name}]`, duration: 1000 }),
            Date.now() + 60_000
        )

    it("is restored on an unsharded process", async () => {
        await guildless()
        await harness.ready()

        assert.equal(harness.client.timeouts.has("n"), true)
    })

    it("is restored on shard 0", async () => {
        harness.client.shard = { ids: [0] }
        await guildless()
        await harness.ready()

        assert.equal(harness.client.timeouts.has("n"), true)
    })

    it("is left alone on every other shard", async () => {
        // otherwise each shard would run it
        harness.client.shard = { ids: [1] }
        await guildless()
        await harness.ready()

        assert.equal(harness.client.timeouts.has("n"), false, "another shard already has this one")
        assert.ok(await Database.get(TimerKind.timeout, "n"), "and it is not that shard's to delete")
    })

    it("is restored once when shard 0 shares a process", async () => {
        harness.client.shard = { ids: [0, 1, 2] }
        await guildless()
        await harness.ready()

        assert.equal(harness.client.timeouts.has("n"), true)
    })
})
