import assert from "node:assert/strict"
import { DataSource } from "typeorm"
import { describe, it } from "node:test"
import { Database, Timer, TimerKind, useTempHome } from "./support/harness"

useTempHome("forgetimers-upgrade")

/** The store keeps its connection to itself, and only a test has business running DDL on it */
const sourceOf = (store: unknown) => (store as { source: DataSource }).source

const columnsOf = async (store: unknown): Promise<string[]> => {
    const columns = (await sourceOf(store).query("PRAGMA table_info(timer)")) as Array<{ name: string }>
    return columns.map((column) => column.name)
}

/**
 * Every other suite opens a database it just created, so nothing else covers the one upgrade
 * path every existing bot takes: a file written by a build that had fewer columns.
 */
describe("opening a database an older build left behind", () => {
    it("adds the columns it is missing, and keeps the rows", async () => {
        const store = await Database.use("forgedb")
        await Database.set(
            new Timer({
                name: "beat",
                kind: TimerKind.interval,
                code: "$testMark[beat]",
                duration: 60_000,
                channelID: "chan-1",
                config: { restoredTicksLimit: "Infinity" },
            })
        )

        // strip what this build added, so the file looks like one an older build wrote
        for (const column of ["config", "pausedAt"]) {
            await sourceOf(store).query(`ALTER TABLE timer DROP COLUMN ${column}`)
        }
        assert.equal((await columnsOf(store)).includes("config"), false, "nothing was dropped, so this proves nothing")

        await Database.destroy()
        const reopened = await Database.use("forgedb")

        const names = await columnsOf(reopened)
        assert.ok(names.includes("config"), "config was never added back")
        assert.ok(names.includes("pausedAt"), "pausedAt was never added back")

        const back = await Database.get(TimerKind.interval, "beat")
        assert.ok(back, "the stored timer did not survive the upgrade")
        assert.equal(back.duration, 60_000)
        assert.equal(back.code, "$testMark[beat]")
        assert.equal(typeof back.fireAt, "number", "its deadline has to come back as a number")
    })

    it("reads a row written before those columns existed as having neither", async () => {
        const store = await Database.use("forgedb")
        await Database.wipe()
        await sourceOf(store).query("ALTER TABLE timer DROP COLUMN config")

        const now = Date.now()
        await sourceOf(store).query(
            `INSERT INTO timer (id, name, kind, code, duration, timestamp, fireAt)
             VALUES ('timeout:old', 'old', 'timeout', '$testMark[old]', 60000, ${now}, ${now + 60_000})`
        )

        await Database.destroy()
        await Database.use("forgedb")

        const back = await Database.get(TimerKind.timeout, "old")
        assert.ok(back, "the row from the older build was lost")
        assert.equal(back.config, null, "it never named any options, so it has none")
        assert.equal(back.pausedAt, null, "and it was never paused")
        assert.equal(back.isPaused(), false, "so it must not read as on hold")
    })
})
