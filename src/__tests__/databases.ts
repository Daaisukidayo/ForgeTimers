import assert from "node:assert/strict"
import { after, before, beforeEach, describe, it } from "node:test"
import { boot, connectionFor, DATABASE_ENV, Database, SqlDatabase, TestDatabase, Timer, TimerKind } from "./harness"

const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000

const sample = () =>
    new Timer({
        name: "reminder",
        kind: TimerKind.timeout,
        code: "$sendMessage[$channelID;now]",
        duration: NINETY_DAYS,
        channelID: "chan-1",
        guildID: "guild-1",
        hostID: "user-1",
        messageID: "msg-1",
        args: ["first", "second"],
        vars: { keywords: { k: "v" }, environment: { n: 1, nested: { deep: true } }, localFunctions: {} },
    })

export function persistenceSuite(target: TestDatabase) {
    if (!connectionFor(target)) {
        describe(`persistence on ${target}`, () => {
            it(`requires ${DATABASE_ENV[target as SqlDatabase]}`, { skip: true }, () => undefined)
        })
        return
    }

    describe(`persistence on ${target}`, () => {
        let harness: Awaited<ReturnType<typeof boot>>

        before(async () => (harness = await boot({}, target)))
        beforeEach(async () => await Database.wipe())
        after(async () => {
            harness.disarm()
            await harness.cleanup()
        })

        it("round-trips every column", async () => {
            const original = sample()
            await Database.set(original)

            const back = await Database.get(TimerKind.timeout, "reminder")
            assert.ok(back)
            assert.equal(back.id, "timeout:reminder")
            assert.equal(back.name, "reminder")
            assert.equal(back.kind, TimerKind.timeout)
            assert.equal(back.code, "$sendMessage[$channelID;now]")
            assert.equal(back.channelID, "chan-1")
            assert.equal(back.guildID, "guild-1")
            assert.equal(back.hostID, "user-1")
            assert.equal(back.messageID, "msg-1")
            assert.deepEqual(back.args, ["first", "second"])
            assert.deepEqual(back.vars, original.vars)
        })

        it("keeps epoch timestamps intact instead of overflowing an int32", async () => {
            const original = sample()
            await Database.set(original)

            const back = await Database.get(TimerKind.timeout, "reminder")
            assert.equal(typeof back!.duration, "number")
            assert.equal(typeof back!.fireAt, "number")
            assert.equal(typeof back!.timestamp, "number")
            assert.equal(back!.duration, NINETY_DAYS)
            assert.equal(back!.fireAt, original.fireAt)
            assert.equal(back!.timestamp, original.timestamp)
            assert.ok(back!.fireAt > 2 ** 31)
        })

        it("hydrates into a Timer, not a plain row", async () => {
            await Database.set(sample())
            const back = await Database.get(TimerKind.timeout, "reminder")
            assert.ok(back instanceof Timer)
            assert.ok(back!.timeLeft() > 0)
            assert.equal(back!.isOverdue(), false)
        })

        it("keeps a timeout and an interval of the same name apart", async () => {
            await Database.set(new Timer({ name: "shared", kind: TimerKind.timeout, duration: 1000, channelID: "c" }))
            await Database.set(new Timer({ name: "shared", kind: TimerKind.interval, duration: 2000, channelID: "c" }))

            assert.equal((await Database.getAll()).length, 2)
            assert.equal((await Database.get(TimerKind.timeout, "shared"))!.duration, 1000)
            assert.equal((await Database.get(TimerKind.interval, "shared"))!.duration, 2000)
        })

        it("overwrites a timer reused under the same name", async () => {
            await Database.set(new Timer({ name: "n", kind: TimerKind.timeout, duration: 1000, channelID: "c" }))
            await Database.set(new Timer({ name: "n", kind: TimerKind.timeout, duration: 5000, channelID: "c" }))

            assert.equal((await Database.getAll()).length, 1)
            assert.equal((await Database.get(TimerKind.timeout, "n"))!.duration, 5000)
        })

        it("filters by kind and by arbitrary fields", async () => {
            await Database.set(new Timer({ name: "a", kind: TimerKind.timeout, duration: 1, channelID: "c", guildID: "g1" }))
            await Database.set(new Timer({ name: "b", kind: TimerKind.interval, duration: 1, channelID: "c", guildID: "g1" }))
            await Database.set(new Timer({ name: "c", kind: TimerKind.interval, duration: 1, channelID: "c", guildID: "g2" }))

            assert.equal((await Database.getAllOf(TimerKind.interval)).length, 2)
            assert.equal((await Database.getAllOf(TimerKind.timeout)).length, 1)
            assert.equal((await Database.find({ guildID: "g1" })).length, 2)
            assert.equal((await Database.find({ guildID: "g2" }, 1)).length, 1)
        })

        it("deletes one timer and wipes the rest", async () => {
            await Database.set(new Timer({ name: "a", kind: TimerKind.timeout, duration: 1, channelID: "c" }))
            await Database.set(new Timer({ name: "b", kind: TimerKind.timeout, duration: 1, channelID: "c" }))

            await Database.delete(TimerKind.timeout, "a")
            assert.equal(await Database.get(TimerKind.timeout, "a"), null)
            assert.equal((await Database.getAll()).length, 1)

            await Database.wipe()
            assert.equal((await Database.getAll()).length, 0)
        })

        it("stores a name of the maximum allowed length", async () => {
            const name = "x".repeat(Timer.maxNameLength(TimerKind.timeout))
            await Database.set(new Timer({ name, kind: TimerKind.timeout, duration: 1, channelID: "c" }))
            assert.ok(await Database.get(TimerKind.timeout, name))
        })

        it("returns null for a timer that was never stored", async () => {
            assert.equal(await Database.get(TimerKind.timeout, "no such timer"), null)
        })

        it("stores null for the optional columns", async () => {
            await Database.set(new Timer({ name: "bare", kind: TimerKind.timeout, duration: 1, channelID: "c" }))

            const back = await Database.get(TimerKind.timeout, "bare")
            assert.equal(back!.guildID, null)
            assert.equal(back!.hostID, null)
            assert.equal(back!.messageID, null)
            assert.equal(back!.path, null)
        })
    })
}
