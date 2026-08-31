import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import { boot, Database, marks, run, Timer, TimerKind } from "./harness"

let harness: Awaited<ReturnType<typeof boot>>

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

before(async () => {
    harness = await boot()
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

async function withSlowWrites<T>(delay: number, fn: () => Promise<T>) {
    const real = Database.set.bind(Database)
    Database.set = async (timer) => {
        await sleep(delay)
        return real(timer)
    }

    try {
        return await fn()
    } finally {
        Database.set = real
    }
}

describe("cancelling while a tick is in flight", () => {
    it("does not let a cancelled interval come back", async () => {
        await run(harness, "$setInterval[$testMark[tick];60;pulse]")

        await withSlowWrites(120, async () => {
            await sleep(90)
            assert.equal(await run(harness, "$clearInterval[pulse]"), "true")
        })

        marks.length = 0
        await sleep(400)

        assert.equal(marks.length, 0, "a cancelled interval kept ticking")
        assert.equal(harness.client.intervals.has("pulse"), false, "and armed itself again")
        assert.equal(await Database.get(TimerKind.interval, "pulse"), null, "and wrote itself back")
    })

    it("does not leave the row behind when the write lands after the cancel", async () => {
        await run(harness, "$setInterval[$testMark[tick];60;pulse]")

        await withSlowWrites(150, async () => {
            await sleep(90)
            await run(harness, "$clearInterval[pulse]")
            await sleep(300)
        })

        assert.equal(await Database.get(TimerKind.interval, "pulse"), null)
    })
})

describe("replacing a timer while it runs", () => {
    it("does not let the outgoing timeout drop its replacement", async () => {
        const manager = harness.ext.timersManager

        const first = new Timer({ name: "job", kind: TimerKind.timeout, code: "a", duration: 50, channelID: "chan-1" })
        await manager.start(first, async () => { await sleep(300) })
        await sleep(150)

        const second = new Timer({
            name: "job",
            kind: TimerKind.timeout,
            code: "b",
            duration: 3_600_000,
            channelID: "chan-1",
        })
        await manager.start(second, async () => undefined)
        const handle = harness.client.timeouts.get("job")

        await sleep(300)

        try {
            assert.equal(
                harness.client.timeouts.has("job"),
                true,
                "the replacement lost its handle and cannot be cancelled"
            )
            assert.equal((await Database.get(TimerKind.timeout, "job"))?.code, "b", "and lost its record")
        } finally {
            clearTimeout(handle)
        }
    })

    it("keeps the replacement cancellable", async () => {
        const manager = harness.ext.timersManager

        const first = new Timer({ name: "job", kind: TimerKind.timeout, code: "a", duration: 50, channelID: "chan-1" })
        await manager.start(first, async () => { await sleep(200) })
        await sleep(120)

        const second = new Timer({ name: "job", kind: TimerKind.timeout, code: "b", duration: 3_600_000, channelID: "chan-1" })
        await manager.start(second, async () => undefined)
        const handle = harness.client.timeouts.get("job")
        await sleep(200)

        try {
            assert.equal(await run(harness, "$clearTimeout[job]"), "true")
            assert.equal(await Database.get(TimerKind.timeout, "job"), null)
        } finally {
            clearTimeout(handle)
        }
    })
})
