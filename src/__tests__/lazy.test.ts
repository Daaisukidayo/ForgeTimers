import assert from "node:assert/strict"
import { describe, it } from "node:test"

/** Each backend's packages, which only whoever picked that backend should have to install */
const BACKEND_PACKAGES = ["typeorm", "reflect-metadata", "@tryforge/forge.db", "@quoriel/db"]

const loaded = (pkg: string) => !!require.cache[require.resolve(pkg)]

describe("what importing the package costs", () => {
    it("loads no backend's dependencies until one is picked", async () => {
        await import("..")

        for (const pkg of BACKEND_PACKAGES) {
            assert.equal(loaded(pkg), false, `${pkg} was loaded just by importing ForgeTimers`)
        }
    })

    it("loads only what the chosen backend needs", async () => {
        const { Database } = await import("../structures")
        await Database.use("quorieldb")

        assert.equal(loaded("@quoriel/db"), true, "the picked backend must be loaded")
        assert.equal(loaded("typeorm"), false, "the other backend's ORM must stay out")

        await Database.destroy()
    })

    it("says what to install when a backend's packages are missing", async () => {
        const { Database } = await import("../structures")
        const resolve = require("module")._resolveFilename

        require("module")._resolveFilename = function (request: string, ...rest: unknown[]) {
            if (request === "@tryforge/forge.db") {
                const err = Object.assign(new Error(`Cannot find module '${request}'`), { code: "MODULE_NOT_FOUND" })
                throw err
            }
            return resolve.call(this, request, ...rest)
        }

        try {
            await assert.rejects(Database.open("forgedb"), /could not be opened/)
        } finally {
            require("module")._resolveFilename = resolve
        }
    })

    it("exports the stores the loader reaches for", async () => {
        const quoriel = await import("../structures/stores/QuorielDBStore")
        const forge = await import("../structures/stores/ForgeDBStore")

        // renaming either class without the loader would only show up at boot
        assert.equal(typeof quoriel.QuorielDBStore, "function", "QuorielDBStore is what load() constructs")
        assert.equal(typeof forge.ForgeDBStore, "function", "ForgeDBStore is what load() constructs")
    })
})
