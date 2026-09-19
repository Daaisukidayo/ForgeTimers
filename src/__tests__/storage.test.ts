import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { attach, useTempHome } from "./support/harness"
import { ForgeTimers } from ".."
import { ITimerEventPayload, TimerEvent } from "../types"

useTempHome("forgetimers-storage")

/** Subscribed before attach(), which is what calls init() and opens the storage */
function watching(ext: ForgeTimers, event: TimerEvent) {
    const seen: ITimerEventPayload[] = []
    ext.emitter.on(event, (payload) => seen.push(payload))

    return seen
}

/**
 * The failure comes first on purpose: blocking forge.db only bites while ForgeDBStore is still
 * uncached, and opening the storage even once would warm it for the rest of the file.
 */
describe("the storage being opened", () => {
    it("reports one it could not open, and why", async () => {
        const resolve = require("module")._resolveFilename

        require("module")._resolveFilename = function (request: string, ...rest: unknown[]) {
            if (request === "@tryforge/forge.db") {
                throw Object.assign(new Error(`Cannot find module '${request}'`), { code: "MODULE_NOT_FOUND" })
            }
            return resolve.call(this, request, ...rest)
        }

        const ext = new ForgeTimers()
        const connected = watching(ext, TimerEvent.databaseConnect)
        const failed = watching(ext, TimerEvent.databaseFail)
        const harness = attach(ext)

        try {
            assert.equal(await harness.ext.ready, false, "a missing backend must not reject the boot")
            assert.deepEqual(connected, [], "nothing opened, so nothing may say it did")
            assert.equal(failed.length, 1, "the failure went unreported")

            const reason = failed[0].event?.failReason
            assert.match(`${reason}`, /could not be opened/, `no reason given: ${reason}`)
        } finally {
            require("module")._resolveFilename = resolve
            harness.disarm()
        }
    })

    it("reports that it opened", async () => {
        const ext = new ForgeTimers()
        const connected = watching(ext, TimerEvent.databaseConnect)
        const failed = watching(ext, TimerEvent.databaseFail)
        const harness = attach(ext)

        try {
            assert.equal(await harness.ext.ready, true)
            assert.equal(connected.length, 1, "the open went unreported")
            assert.deepEqual(failed, [], "nothing failed, so nothing may say so")
        } finally {
            harness.disarm()
        }
    })
})
