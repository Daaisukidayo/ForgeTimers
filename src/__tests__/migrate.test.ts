import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, before, beforeEach, describe, it } from "node:test"
import { ForgeClient } from "@tryforge/forgescript"
import { ConfigSeed, Database, Timer, TimerKind } from "./harness"
import { migrateTimers, TimerStorage } from ".."

const home = process.cwd()
const folder = mkdtempSync(join(tmpdir(), "forgetimers-migrate-"))

const clientWith = (...extensions: string[]) =>
    ({ options: { extensions: extensions.map((name) => ({ name })) } }) as unknown as ForgeClient

const both = clientWith("forge.db", "QuorielDB")

before(() => {
    // quoriel hangs its store off the working directory, forge.db off its configured folder
    process.chdir(folder)
    new ConfigSeed({ type: "better-sqlite3", folder: "forgedb" } as never)
})

after(async () => {
    await Database.destroy().catch(() => undefined)
    process.chdir(home)
    rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
})

beforeEach(async () => {
    for (const storage of ["forgedb", "quorieldb"] as TimerStorage[]) {
        await Database.use(storage)
        await Database.wipe()
    }
})

const timer = (name: string, dueIn = 3_600_000, kind = TimerKind.timeout) =>
    new Timer({ name, kind, code: `$testMark[${name}]`, duration: dueIn, channelID: "chan-1" })

/** Fills `from` with timers, then opens `to` ready for a migration */
async function seed(from: TimerStorage, to: TimerStorage, timers: Timer[]) {
    await Database.use(from)
    for (const t of timers) await Database.set(t)

    await Database.use(to)
}

/** Reads a backend without leaving it in charge */
async function contentsOf(storage: TimerStorage) {
    const store = await Database.open(storage)
    const all = await store.getAll()
    await store.destroy()

    return all.map((t) => t.id).sort()
}

describe("moving timers between backends", () => {
    for (const [from, to] of [
        ["forgedb", "quorieldb"],
        ["quorieldb", "forgedb"],
    ] as Array<[TimerStorage, TimerStorage]>) {
        it(`moves them from ${from} to ${to}`, async () => {
            const original = timer("reminder")
            await seed(from, to, [original, timer("beat", 60_000, TimerKind.interval)])

            const result = await migrateTimers(both, from, to)

            assert.deepEqual(result, { moved: 2, skipped: [], drained: true })
            assert.deepEqual(await contentsOf(to), ["interval:beat", "timeout:reminder"])
            assert.deepEqual(await contentsOf(from), [], "the source was not drained")
        })

        it(`keeps the deadline intact from ${from} to ${to}`, async () => {
            const original = timer("reminder")
            await seed(from, to, [original])

            await migrateTimers(both, from, to)

            const back = await Database.get(TimerKind.timeout, "reminder")
            assert.equal(back!.fireAt, original.fireAt)
            assert.equal(back!.duration, original.duration)
            assert.equal(back!.code, "$testMark[reminder]")
            assert.ok(back!.timeLeft() > 3_000_000, "a moved timer must not restart its wait")
        })
    }

    it("carries every field across", async () => {
        const original = new Timer({
            name: "full",
            kind: TimerKind.timeout,
            code: "$sendMessage[hi]",
            path: "/cmd.js",
            commandName: "cmd",
            duration: 90 * 24 * 60 * 60 * 1000,
            guildID: "guild-1",
            channelID: "chan-1",
            hostID: "user-1",
            messageID: "msg-1",
            args: ["a", "b"],
            vars: { keywords: { k: "v" }, environment: { n: 1 }, localFunctions: {} },
        })

        await seed("forgedb", "quorieldb", [original])
        await migrateTimers(both, "forgedb", "quorieldb")

        const back = await Database.get(TimerKind.timeout, "full")
        assert.equal(back!.guildID, "guild-1")
        assert.equal(back!.hostID, "user-1")
        assert.equal(back!.messageID, "msg-1")
        assert.equal(back!.commandName, "cmd")
        assert.equal(back!.path, "/cmd.js")
        assert.deepEqual(back!.args, ["a", "b"])
        assert.deepEqual(back!.vars, original.vars)
        assert.equal(back!.version, Timer.SCHEMA_VERSION)
    })
})

describe("running it more than once", () => {
    it("does nothing the second time", async () => {
        await seed("forgedb", "quorieldb", [timer("once")])
        await migrateTimers(both, "forgedb", "quorieldb")

        const again = await migrateTimers(both, "forgedb", "quorieldb")

        assert.deepEqual(again, { moved: 0, skipped: [], drained: true })
        assert.deepEqual(await contentsOf("quorieldb"), ["timeout:once"])
    })

    it("cannot resurrect a timer that already fired", async () => {
        await seed("forgedb", "quorieldb", [timer("spent")])
        await migrateTimers(both, "forgedb", "quorieldb")

        // the timeout runs and clears itself, the way a restored one would
        await Database.delete(TimerKind.timeout, "spent")
        await migrateTimers(both, "forgedb", "quorieldb")

        assert.deepEqual(await contentsOf("quorieldb"), [])
    })
})

describe("names already taken", () => {
    it("leaves the target's own timer alone", async () => {
        await seed("forgedb", "quorieldb", [timer("shared", 1000), timer("free")])
        await Database.set(timer("shared", 7_200_000))

        const result = await migrateTimers(both, "forgedb", "quorieldb")

        assert.equal(result!.moved, 1)
        assert.deepEqual(result!.skipped, ["timeout:shared"])
        assert.equal(result!.drained, false, "a skipped timer means the source still holds something")

        const kept = await Database.get(TimerKind.timeout, "shared")
        assert.equal(kept!.duration, 7_200_000, "the target's timer was overwritten")
        assert.deepEqual(await contentsOf("forgedb"), ["timeout:shared"], "the skipped one must stay put")
    })
})

describe("copying instead of moving", () => {
    it("leaves the source untouched", async () => {
        await seed("forgedb", "quorieldb", [timer("kept")])

        const result = await migrateTimers(both, "forgedb", "quorieldb", true)

        assert.equal(result!.moved, 1)
        assert.equal(result!.drained, false)
        assert.deepEqual(await contentsOf("forgedb"), ["timeout:kept"])
        assert.deepEqual(await contentsOf("quorieldb"), ["timeout:kept"])
    })
})

describe("a target that loses a write", () => {
    it("stops without dropping anything from the source", async () => {
        await seed("forgedb", "quorieldb", [timer("fragile"), timer("fine")])

        const real = Database.get
        // accepts the write and does not keep it - exactly what the read-back guards against
        Database.get = (async (kind: TimerKind, name: string) =>
            name === "fragile" ? null : await real.call(Database, kind, name)) as typeof Database.get

        try {
            assert.equal(await migrateTimers(both, "forgedb", "quorieldb"), null)
        } finally {
            Database.get = real
        }

        assert.ok(
            (await contentsOf("forgedb")).includes("timeout:fragile"),
            "the source lost a timer the target never kept"
        )
    })
})

describe("refusing to run", () => {
    it("says so when the source extension is missing", async () => {
        await seed("forgedb", "quorieldb", [timer("stranded")])

        const result = await migrateTimers(clientWith("QuorielDB"), "forgedb", "quorieldb")

        assert.equal(result, null)
        assert.deepEqual(await contentsOf("forgedb"), ["timeout:stranded"], "nothing may move")
    })

    it("says so when both ends are the same backend", async () => {
        await Database.use("quorieldb")
        assert.equal(await migrateTimers(both, "quorieldb", "quorieldb"), null)
    })
})
