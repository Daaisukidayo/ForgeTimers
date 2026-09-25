import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { marks, persist, TestHarness, Timer, TimerKind, useHarness, waitFor } from "./support/harness"
import { readFilters } from "../properties/timer"
import { TimerEvent } from "../types"

let harness: TestHarness

useHarness((booted) => (harness = booted), {
    options: { events: [TimerEvent.timerFire] },
    setup: (booted) => {
        booted.ext.commands.add({
            type: TimerEvent.timerFire,
            code: "$testMark[old=$oldTimer[args]|new=$newTimer[args]|cron=$timerData[cron]]",
        })
    },
})

describe("a filter property", () => {
    it("is refused when it only exists on the prototype", () => {
        for (const named of ["toString", "constructor", "hasOwnProperty", "valueOf", "__proto__"]) {
            const read = readFilters([named, "whatever"])
            assert.equal(read.ok, false, `"${named}" was taken for a timer property`)
        }
    })

    it("is taken when it is a real one", () => {
        const read = readFilters(["authorID", "user-1", "kind", "cron"])

        assert.equal(read.ok, true)
        assert.deepEqual(read.ok && read.pairs, [
            ["authorID", "user-1"],
            ["kind", "cron"],
        ])
    })
})

describe("every reader of a timer's properties", () => {
    it("hands back the same shapes, whichever one is asked", async () => {
        await persist(
            new Timer({
                name: "p",
                kind: TimerKind.interval,
                code: "$testMark[data=$timerData[args]|none=$timerData[cron]]",
                duration: 60,
                args: ["first", "second"],
            }),
            Date.now() + 60
        )

        await harness.ready()
        await waitFor(() => marks.some((mark) => mark.startsWith("old=")), 3000)
        harness.disarm()

        const read = (prefix: string) => {
            const mark = marks.find((one) => one.startsWith(prefix))!
            return Object.fromEntries(mark.split("|").map((part) => part.split(/=(.*)/s).slice(0, 2)))
        }

        const event = read("old=")
        const own = read("data=")

        // an array has to survive as one, rather than flattening to "first,second"
        for (const [who, raw] of [
            ["$oldTimer", event.old],
            ["$newTimer", event.new],
            ["$timerData", own.data],
        ]) {
            assert.deepEqual(JSON.parse(raw), ["first", "second"], `${who} flattened the arguments`)
        }

        // a property this kind never has reads as nothing, not as the word "null"
        assert.equal(event.cron, "", "$timerData spelled a missing property out as null in an event")
        assert.equal(own.none, "", "$timerData spelled a missing property out as null in a timer's own code")
    })
})
