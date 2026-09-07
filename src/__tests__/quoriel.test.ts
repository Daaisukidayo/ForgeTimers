import assert from "node:assert/strict"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { after, before, beforeEach, describe, it } from "node:test"
import { boot, Database, marks, persist, run, Timer, TimerKind, waitFor } from "./harness"
import { ForgeTimers } from ".."
import { QUORIEL_TYPE, QuorielDBStore } from "../structures"

let harness: Awaited<ReturnType<typeof boot>>

before(async () => {
    harness = await boot({}, "quoriel")
    harness.channels.set("chan-1", { id: "chan-1" })
})

beforeEach(async () => {
    harness.disarm()
    await Database.wipe()
    marks.length = 0
})

after(async () => {
    harness.disarm()
    await harness.cleanup()
})

const store = () => join(process.cwd(), "database")

describe("choosing a backend", () => {
    it("defaults to ForgeDB", () => {
        assert.deepEqual(new ForgeTimers().requireExtensions, ["forge.db"])
    })

    it("requires QuorielDB instead when asked for it", () => {
        assert.deepEqual(new ForgeTimers({ storage: "quorieldb" }).requireExtensions, ["QuorielDB"])
    })

    it("opened the store the option asked for", async () => {
        assert.ok((await Database.use("quorieldb")) instanceof QuorielDBStore)
    })
})

describe("the record type", () => {
    it("keeps its records in QuorielDB's own store", () => {
        assert.ok(existsSync(join(store(), "types", QUORIEL_TYPE)), "the timers went somewhere else")
    })

    it("is one QuorielDB's own functions can read", () => {
        const { types } = require("@quoriel/db") as { types: Map<string, unknown> }

        assert.equal(QUORIEL_TYPE, "timers")
        assert.deepEqual(types.get(QUORIEL_TYPE), { type: null, guild: false })
    })

    it("leaves the config file alone", async () => {
        const file = join(store(), "config.json")
        const original = JSON.stringify({ types: { user: { type: "user", guild: false } } }, null, 4)
        writeFileSync(file, original, "utf8")

        await Database.use("quorieldb")

        assert.equal(readFileSync(file, "utf8"), original, "the config was rewritten")
    })

    it("keeps the timers when the store is opened again", async () => {
        await Database.set(
            new Timer({ name: "kept", kind: TimerKind.timeout, code: "$testMark[x]", duration: 3_600_000 })
        )
        await Database.use("quorieldb")

        assert.ok(await Database.get(TimerKind.timeout, "kept"))
    })
})

describe("timers on lmdb", () => {
    it("persists a timer scheduled from a script", async () => {
        await run(harness, "$setTimeout[$testMark[x];1h;reminder]")

        const row = await Database.get(TimerKind.timeout, "reminder")
        assert.ok(row)
        assert.equal(row.code, "$testMark[x]")
        assert.equal(row.duration, 3_600_000)
    })

    it("runs a timeout and clears its record", async () => {
        await run(harness, "$setTimeout[$testMark[fired];60;quick]")
        await waitFor(async () => (await Database.get(TimerKind.timeout, "quick")) === null)

        assert.deepEqual(marks, ["fired"])
    })

    it("restores a stored timer on startup", async () => {
        await persist(
            new Timer({
                name: "survivor",
                kind: TimerKind.timeout,
                code: "$testMark[restored]",
                duration: 60_000,
                channelID: "chan-1",
            }),
            Date.now() - 1000
        )

        await harness.ready()
        await waitFor(() => marks.includes("restored"))

        assert.deepEqual(marks, ["restored"])
        assert.equal(await Database.get(TimerKind.timeout, "survivor"), null)
    })

    it("resumes an interval on the time left rather than a fresh tick", async () => {
        await persist(
            new Timer({
                name: "beat",
                kind: TimerKind.interval,
                code: "$testMark[tick]",
                duration: 3_600_000,
                channelID: "chan-1",
            }),
            Date.now() + 200
        )

        await harness.ready()
        await waitFor(() => marks.length > 0)

        assert.deepEqual(marks, ["tick"])
        const row = await Database.get(TimerKind.interval, "beat")
        assert.ok(row!.timeLeft() > 3_000_000, "the next tick was not a full duration away")
    })

    it("keeps variables through a restart", async () => {
        await run(harness, "$let[note;kept]$setTimeout[$testMark[$get[note]];60;vars]")
        harness.disarm()

        await harness.ready()
        await waitFor(() => marks.length > 0)

        assert.deepEqual(marks, ["kept"])
    })
})
