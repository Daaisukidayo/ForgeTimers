import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    Database,
    marks,
    patchDatabase,
    restoreDatabase,
    run,
    TestHarness,
    Timer,
    TimerKind,
    useHarness,
    waitFor,
} from "./harness"

let harness: TestHarness

useHarness((booted) => (harness = booted))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function withSlowWrites<T>(delay: number, fn: () => Promise<T>) {
    patchDatabase("set", (real) => async (timer) => {
        await sleep(delay)
        return real(timer)
    })

    try {
        return await fn()
    } finally {
        restoreDatabase()
    }
}

describe("cancelling while a tick is in flight", () => {
    it("does not let a cancelled interval come back", async () => {
        await run(harness, "$setInterval[$testMark[tick];60;pulse]")

        await waitFor(() => marks.length >= 1)

        await withSlowWrites(600, async () => {
            await sleep(150)
            assert.equal(await run(harness, "$clearInterval[pulse]"), "true")
        })

        marks.length = 0
        await sleep(500)

        assert.equal(marks.length, 0, "a cancelled interval kept ticking")
        assert.equal(harness.client.intervals.has("pulse"), false, "and armed itself again")
        assert.equal(await Database.get(TimerKind.interval, "pulse"), null, "and wrote itself back")
    })

    it("does not leave the row behind when the write lands after the cancel", async () => {
        await run(harness, "$setInterval[$testMark[tick];60;pulse]")

        await waitFor(() => marks.length >= 1)

        await withSlowWrites(600, async () => {
            await sleep(150)
            await run(harness, "$clearInterval[pulse]")
            await sleep(700)
        })

        assert.equal(await Database.get(TimerKind.interval, "pulse"), null)
    })
})

describe("replacing a timer while it runs", () => {
    it("does not let the outgoing timeout drop its replacement", async () => {
        const manager = harness.ext.timersManager

        const first = new Timer({ name: "job", kind: TimerKind.timeout, code: "a", duration: 50, channelID: "chan-1" })
        let running = false
        await manager.start(first, async () => {
            running = true
            await sleep(1500)
            running = false
        })
        await waitFor(() => running)

        const second = new Timer({
            name: "job",
            kind: TimerKind.timeout,
            code: "b",
            duration: 3_600_000,
            channelID: "chan-1",
        })
        await manager.start(second, async () => undefined)
        const handle = harness.client.timeouts.get("job")

        await waitFor(() => !running)

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
        let running = false
        await manager.start(first, async () => {
            running = true
            await sleep(1000)
            running = false
        })
        await waitFor(() => running)

        const second = new Timer({
            name: "job",
            kind: TimerKind.timeout,
            code: "b",
            duration: 3_600_000,
            channelID: "chan-1",
        })
        await manager.start(second, async () => undefined)
        const handle = harness.client.timeouts.get("job")
        await waitFor(() => !running)

        try {
            assert.equal(await run(harness, "$clearTimeout[job]"), "true")
            assert.equal(await Database.get(TimerKind.timeout, "job"), null)
        } finally {
            clearTimeout(handle)
        }
    })
})

describe("the claim a name is on", () => {
    const claims = () => harness.ext.timersManager["generations"]

    it("is dropped once the name is cancelled", async () => {
        for (let i = 0; i < 20; i++) await run(harness, `$setTimeout[$testMark[x];1h;t${i}]`)
        assert.equal(claims().size, 20, "an armed name has to be tracked")

        for (let i = 0; i < 20; i++) await run(harness, `$clearTimeout[t${i}]`)
        assert.equal(claims().size, 0, "a cancelled name must not be tracked for the life of the process")
    })

    it("is dropped once a timeout has run", async () => {
        await run(harness, "$setTimeout[$testMark[ran];50;quick]")
        assert.ok(await waitFor(() => marks.includes("ran")), "the timer never ran")

        assert.ok(await waitFor(() => claims().size === 0), `${claims().size} left behind`)
    })

    it("is kept while an interval is still ticking", async () => {
        await run(harness, "$setInterval[$testMark[tick];50;beat]")
        assert.ok(await waitFor(() => marks.filter((mark) => mark === "tick").length >= 2))

        assert.equal(claims().size, 1, "an interval owns its name until it is cancelled")

        await run(harness, "$clearInterval[beat]")
        assert.equal(claims().size, 0)
    })
})
