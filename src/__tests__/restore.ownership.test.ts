import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { ShardClientUtil } from "discord.js"
import { Database, persist, TestHarness, Timer, TimerKind, useHarness } from "./support/harness"

let harness: TestHarness

useHarness((booted) => (harness = booted))

describe("ownership across processes", () => {
    it("runs a timer whose guild it cannot see, with nothing to share the work with", async () => {
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

        assert.ok(await Database.get(TimerKind.timeout, "n"), "it is not anyone else's to leave alone")
        assert.equal(harness.client.timeouts.has("n"), true, "a guild it never uses must not hold its code back")
    })

    it("takes only the guilds its own shards own, whether or not they are in cache", async () => {
        // discord hands a guild to (id >> 22) % count, so ask it which shard each of these is for
        const ours = "1234567890123456789"
        const mine = ShardClientUtil.shardIdForGuildId(ours, 4)

        const theirs = "9876543210987654321"
        assert.notEqual(ShardClientUtil.shardIdForGuildId(theirs, 4), mine, "both guilds landed on one shard")

        harness.client.shard = { ids: [mine], count: 4 }

        for (const [name, guildID] of [
            ["ours", ours],
            ["theirs", theirs],
        ] as const) {
            await persist(
                new Timer({ name, kind: TimerKind.timeout, code: `$testMark[${name}]`, duration: 1000, guildID }),
                Date.now() + 60_000
            )
        }

        await harness.ready()

        assert.equal(harness.client.timeouts.has("ours"), true, "its own shard's guild was passed over")
        assert.equal(harness.client.timeouts.has("theirs"), false, "it took a guild belonging to another shard")
    })

    it("leaves a guildless timer to shard 0", async () => {
        harness.client.shard = { ids: [2], count: 4 }
        await persist(
            new Timer({ name: "loose", kind: TimerKind.timeout, code: "$testMark[loose]", duration: 1000 }),
            Date.now() + 60_000
        )

        await harness.ready()

        assert.equal(harness.client.timeouts.has("loose"), false, "every shard would have run it")
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
