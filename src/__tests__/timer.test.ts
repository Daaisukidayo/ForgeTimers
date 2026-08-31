import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { Timer, TimerKind } from "../structures"
import { MAX_DELAY, setLongInterval, setLongTimeout } from "../functions/schedule"

const make = (duration: number, kind = TimerKind.interval) =>
    new Timer({ name: "t", kind, duration, channelID: "c" })

describe("Timer arithmetic", () => {
    it("starts due one duration out", () => {
        const t = make(1000)
        assert.equal(t.fireAt, t.timestamp + 1000)
        assert.ok(t.timeLeft() > 900 && t.timeLeft() <= 1000)
        assert.equal(t.overdueBy(), 0)
        assert.equal(t.isOverdue(), false)
    })

    it("reports how far past due it is", () => {
        const t = make(1000)
        t.fireAt = Date.now() - 2500
        assert.ok(t.overdueBy() >= 2500)
        assert.equal(t.isOverdue(), true)
        assert.equal(t.timeLeft(), 0, "time left never goes negative")
    })

    it("counts the tick due now among the missed ones", () => {
        const t = make(1000)
        t.fireAt = Date.now()
        assert.equal(t.missedTicks(), 1)
        t.fireAt = Date.now() - 2500
        assert.equal(t.missedTicks(), 3)
    })

    it("never reports missed ticks for a timeout", () => {
        const t = make(1000, TimerKind.timeout)
        t.fireAt = Date.now() - 10_000
        assert.equal(t.missedTicks(), 0)
    })

    it("advance() keeps the phase instead of drifting", () => {
        const t = make(1000)
        const due = t.fireAt
        t.advance()
        assert.equal(t.fireAt, due + 1000, "one whole tick, measured from the old due time")
    })

    it("advance() catches up by whole ticks after a slow run", () => {
        const t = make(1000)
        t.fireAt = Date.now() - 2500
        t.advance()
        const ahead = t.fireAt - Date.now()
        assert.ok(ahead > 0 && ahead <= 1000, `landed ${ahead}ms out, expected within one tick`)
    })

    it("advance() terminates on a zero duration", () => {
        const t = make(0)
        t.advance()
        assert.ok(t.fireAt >= Date.now() - 5)
    })

    it("scheduleNext() abandons the phase and waits a full duration", () => {
        const t = make(1000)
        t.fireAt = Date.now() - 5000
        t.scheduleNext()
        assert.ok(t.fireAt - Date.now() > 900)
    })
})

describe("name and id limits", () => {
    it("builds ids as kind:name", () => {
        assert.equal(Timer.idOf(TimerKind.timeout, "x"), "timeout:x")
    })

    it("leaves room for the kind inside the 255 character key", () => {
        for (const kind of [TimerKind.timeout, TimerKind.interval]) {
            const longest = "x".repeat(Timer.maxNameLength(kind))
            assert.equal(Timer.idOf(kind, longest).length, Timer.MAX_ID_LENGTH)
            assert.ok(Timer.idOf(kind, longest + "x").length > Timer.MAX_ID_LENGTH)
        }
    })
})

describe("long delays", () => {
    it("does not collapse a delay past node's cap", async () => {
        let fired = false
        let live: NodeJS.Timeout | undefined
        let arms = 0
        setLongTimeout(90 * 24 * 60 * 60 * 1000, () => (fired = true), (h) => {
            live = h
            arms++
        })

        await new Promise((r) => setTimeout(r, 150))
        clearTimeout(live!)

        assert.equal(fired, false, "a 90 day timeout fired immediately, the 32-bit cap is back")

        assert.equal(arms, 1, `re-armed ${arms} times in 150ms, the delay is not being capped`)
    })

    it("does not tick an interval whose tick is past the cap", async () => {
        let ticks = 0
        let live: NodeJS.Timeout | undefined
        let arms = 0
        setLongInterval(90 * 24 * 60 * 60 * 1000, () => { ticks++ }, (h) => {
            live = h
            arms++
        })

        await new Promise((r) => setTimeout(r, 150))
        clearInterval(live!)

        assert.equal(ticks, 0)
        assert.equal(arms, 1, `re-armed ${arms} times in 150ms`)
    })

    it("still fires a short delay on time", async () => {
        const started = Date.now()
        const fired = await new Promise<number>((resolve) => {
            setLongTimeout(120, () => resolve(Date.now() - started))
        })
        assert.ok(fired >= 110 && fired < 400, `fired after ${fired}ms`)
    })

    it("ticks a short interval repeatedly", async () => {
        let ticks = 0

        let live: NodeJS.Timeout | undefined
        setLongInterval(50, () => { ticks++ }, (h) => (live = h))
        await new Promise((r) => setTimeout(r, 260))
        clearInterval(live!)
        assert.ok(ticks >= 3, `only ${ticks} ticks`)
    })

    it("hands every re-armed chunk to onArm so it stays cancellable", async () => {
        const handles: NodeJS.Timeout[] = []

        setLongTimeout(MAX_DELAY + 50, () => undefined, (h) => handles.push(h))
        assert.equal(handles.length, 1, "the first chunk is reported straight away")
        clearTimeout(handles[0])
    })
})
