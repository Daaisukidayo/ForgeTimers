import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { attach, Database, ITestClient, marks, Timer, TimerKind, useTempHome, waitFor } from "./harness"
import { ForgeTimers } from ".."
import { IForgeTimersOptions, TimerEvent } from "../types"
import { Logger } from "../functions/logger"

useTempHome("forgetimers-options")

beforeEach(async () => {
    marks.length = 0
    await Database.wipe().catch(() => undefined)
})

/** What the extension said about the config, and what it did with the timers it found */
async function boots(
    options: IForgeTimersOptions,
    seed: (harness: ITestClient) => Promise<void> = async () => undefined
) {
    const said: string[] = []
    const warn = Logger.warn

    Logger.warn = (...args: unknown[]) => said.push(args.join(" "))

    let harness: ITestClient
    try {
        harness = attach(new ForgeTimers(options))
        assert.equal(await harness.ext.ready, true, "the extension refused to open at all")
    } finally {
        Logger.warn = warn
    }

    harness.channels.set("chan-1", { id: "chan-1" })
    await Database.wipe()
    await seed(harness)
    await harness.ready()

    return { said, harness }
}

const late = (name: string, lateBy: number) =>
    Object.assign(
        new Timer({ name, kind: TimerKind.timeout, code: `$testMark[${name}]`, duration: 60_000, channelID: "chan-1" }),
        { fireAt: Date.now() - lateBy }
    )

const behind = (name: string, duration: number, lateBy: number) =>
    Object.assign(
        new Timer({ name, kind: TimerKind.interval, code: "$testMark[tick]", duration, channelID: "chan-1" }),
        { fireAt: Date.now() - lateBy }
    )

const ticks = () => marks.filter((mark) => mark === "tick").length

describe("a config nobody meant to write", () => {
    it("names the backends when asked for one that does not exist", async () => {
        const { said, harness } = await boots({ storage: "postgres" as never })

        assert.ok(
            said.some((line) => line.includes("postgres") && line.includes("not a backend")),
            `nothing was said about it: ${said}`
        )
        harness.disarm()
    })

    it("says a negative maxOverdue throws every late timer away, and then does it", async () => {
        const { said, harness } = await boots({ timeoutConfig: { maxOverdue: -5 } }, async () => {
            await Database.set(late("n", 1000))
        })

        assert.ok(
            said.some((line) => line.includes("maxOverdue") && line.includes("throws away")),
            `nothing was said about it: ${said}`
        )
        assert.ok(!(await waitFor(() => marks.includes("n"), 200)), "it ran anyway")
        assert.equal(await Database.get(TimerKind.timeout, "n"), null, "and the record survived")

        harness.disarm()
    })

    it("leaves a zero maxOverdue alone, which is the documented no limit", async () => {
        const { said, harness } = await boots({ timeoutConfig: { maxOverdue: 0 } }, async () => {
            await Database.set(late("n", 1000))
        })

        assert.deepEqual(said, [], `0 is a real setting, not a mistake: ${said}`)
        assert.ok(await waitFor(() => marks.includes("n")), "a timer past a limit of none was dropped")

        harness.disarm()
    })

    it("points a negative tick limit at Infinity, and replays nothing meanwhile", async () => {
        const { said, harness } = await boots({ intervalConfig: { restoredTicksLimit: -1 } }, async () => {
            await Database.set(behind("b", 1000, 4500))
        })

        assert.ok(
            said.some((line) => line.includes("restoredTicksLimit") && line.includes("Infinity")),
            `nothing was said about it: ${said}`
        )
        assert.ok(!(await waitFor(() => ticks() > 0, 200)), "a negative limit replayed ticks")

        harness.disarm()
    })

    it("replays every missed tick at Infinity", async () => {
        const { harness } = await boots({ intervalConfig: { restoredTicksLimit: Infinity } }, async () => {
            await Database.set(behind("b", 1000, 4500))
        })

        assert.ok(await waitFor(() => ticks() >= 5), `replayed ${ticks()} of the 5 missed ticks`)
        harness.disarm()
    })

    it("replays whole ticks when the limit is not a whole number", async () => {
        const { harness } = await boots({ intervalConfig: { restoredTicksLimit: 2.7 } }, async () => {
            await Database.set(behind("b", 1000, 4500))
        })

        assert.ok(await waitFor(() => ticks() >= 3), `replayed ${ticks()}`)
        assert.equal(ticks(), 3, "a fraction of a tick is still a tick")

        harness.disarm()
    })

    it("names an event nobody emits, and forgescript stops the boot over it", () => {
        const said: string[] = []
        const warn = Logger.warn

        Logger.warn = (...args: unknown[]) => said.push(args.join(" "))

        try {
            assert.throws(() => attach(new ForgeTimers({ events: ["timerFires" as TimerEvent] })), /not supported/)
        } finally {
            Logger.warn = warn
        }

        assert.ok(
            said.some((line) => line.includes("timerFires") && line.includes("not a timer event")),
            `the boot died without saying which event was wrong: ${said}`
        )
    })

    it("takes persist as written, so a string is not an off switch", async () => {
        const { harness } = await boots({ timeoutConfig: { persist: "false" as never } }, async () => {
            await Database.set(late("n", 1000))
        })

        assert.ok(await waitFor(() => marks.includes("n")), 'persist: "false" is a truthy string, not false')
        harness.disarm()
    })
})
