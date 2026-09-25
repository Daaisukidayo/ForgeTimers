import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
    Database,
    marks,
    patchDatabase,
    persist,
    restoreDatabase,
    run,
    TestHarness,
    Timer,
    TimerKind,
    useHarness,
    waitFor,
} from "./support/harness"

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

describe("cancelling while startup is writing", () => {
    it("takes the row back out when the restored write lands after the cancel", async () => {
        await persist(
            new Timer({ name: "pulse", kind: TimerKind.interval, code: "$testMark[tick]", duration: 60 }),
            Date.now() - 1000
        )

        await withSlowWrites(600, async () => {
            const booted = harness.ready()
            await sleep(150)

            assert.equal(await run(harness, "$clearInterval[pulse]"), "true")
            await booted
        })

        assert.equal(await Database.get(TimerKind.interval, "pulse"), null, "the row came back after the cancel")
        assert.equal(harness.client.intervals.has("pulse"), false, "and it armed itself again")
    })
})

/** Slows only the writes the predicate picks. Makes one write land after another. */
async function withSlowWritesOf<T>(slow: (timer: Timer) => boolean, fn: () => Promise<T>) {
    patchDatabase("set", (real) => async (timer) => {
        if (slow(timer)) await sleep(400)
        return real(timer)
    })

    try {
        return await fn()
    } finally {
        restoreDatabase()
    }
}

describe("holding or moving a timer while its tick is writing", () => {
    it("keeps a hold that lands while the tick writes, rather than losing the timer", async () => {
        await run(harness, "$setInterval[$testMark[tick];60;pulse]")
        await waitFor(() => marks.length >= 1)

        // the tick writes the timer running, the hold writes it held
        await withSlowWritesOf(
            (timer) => !timer.isPaused(),
            async () => {
                await sleep(100)
                assert.equal(await run(harness, "$pauseTimer[interval;pulse]"), "true")
            }
        )

        // long enough for the tick's write to have landed, however soon the hold came back
        await sleep(600)

        const row = await Database.get(TimerKind.interval, "pulse")
        assert.ok(row, "holding the timer threw it away")
        assert.equal(row.isPaused(), true, "and it came back running")
        assert.equal(harness.client.intervals.has("pulse"), false)
    })

    it("keeps a hold that lands first, rather than letting the tick write over it", async () => {
        await run(harness, "$setInterval[$testMark[tick];60;pulse]")
        await waitFor(() => marks.length >= 1)

        // the hold reads slowly, a tick comes due meanwhile and queues its write behind it
        patchDatabase("get", (real) => async (kind, name) => {
            await sleep(300)
            return real(kind, name)
        })

        try {
            assert.equal(await run(harness, "$pauseTimer[interval;pulse]"), "true")
        } finally {
            restoreDatabase()
        }

        await sleep(200)
        assert.equal((await Database.get(TimerKind.interval, "pulse"))!.isPaused(), true, "the tick wrote it running")
    })

    it("keeps a new schedule that lands while the tick writes", async () => {
        await run(harness, "$setInterval[$testMark[tick];60;beat]")
        await waitFor(() => marks.length >= 1)

        await withSlowWritesOf(
            (timer) => timer.duration === 60,
            async () => {
                await sleep(100)
                assert.equal(await run(harness, "$rescheduleTimer[interval;beat;1h]"), "true")
            }
        )

        await sleep(600)

        const row = await Database.get(TimerKind.interval, "beat")
        assert.equal(row!.duration, 3_600_000, "the tick wrote the old schedule back")
        harness.disarm()
    })
})

describe("a timeout whose code is already running", () => {
    it("can be neither held nor moved, since either would run it a second time", async () => {
        await run(harness, "$setTimeout[$testMark[ran]$wait[300];60;n]")
        await waitFor(() => marks.includes("ran"), 2000)

        assert.equal(await run(harness, "$pauseTimer[timeout;n]"), "false")
        assert.equal(await run(harness, "$rescheduleTimer[timeout;n;1h]"), "false")

        await sleep(500)
        assert.equal(await run(harness, "$resumeTimer[timeout;n]"), "false")
        await sleep(200)

        assert.equal(marks.filter((mark) => mark === "ran").length, 1, "it ran twice")
        assert.equal(await Database.get(TimerKind.timeout, "n"), null, "and it is not spent")
    })
})

describe("releasing a held timeout twice at once", () => {
    it("starts it once, whichever release comes first", async () => {
        await run(harness, "$setTimeout[$testMark[ran];200;n]")
        assert.equal(await run(harness, "$pauseTimer[timeout;n]"), "true")

        // both releases would read the timer held before either write landed
        let said: unknown[] = []
        await withSlowWritesOf(
            () => true,
            async () => {
                said = await Promise.all([
                    run(harness, "$resumeTimer[timeout;n]"),
                    run(harness, "$resumeTimer[timeout;n]"),
                ])
            }
        )

        assert.deepEqual([...said].sort(), ["false", "true"], "both releases took")

        await sleep(600)
        assert.equal(marks.filter((mark) => mark === "ran").length, 1, "it ran once per release")
    })
})
