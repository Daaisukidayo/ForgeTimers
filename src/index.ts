import { ForgeClient, ForgeExtension } from "@tryforge/forgescript"
import { TimersManager } from "./managers"
import { Database, TimerStorage } from "./structures"
import { migrateTimers } from "./functions/migrate"
import { IIntervalConfig, ITimeoutConfig } from "./types"
import { Logger } from "./functions/logger"
import { description, version } from "../package.json"
import path from "path"

export interface IForgeTimersOptions {
    timeoutConfig?: ITimeoutConfig
    intervalConfig?: IIntervalConfig

    /**
     * Delete timers whose guild this process can't see on startup. Off by default. 
     * That's usually an outage or a sibling shard. Only safe unsharded.
     */
    pruneUnknownGuilds?: boolean

    /**
     * Which extension keeps the timers: `"forgedb"` (default) or `"quorieldb"`.
     */
    storage?: TimerStorage

    /**
     * Move stored timers out of this backend and into {@link storage} on startup, once.
     * Both extensions have to be loaded for that boot. Names already taken in the target
     * are left alone.
     */
    migrateFrom?: TimerStorage

    /**
     * Copy on migration instead of moving. The source keeps its timers, which means the
     * migration runs again on every boot until `migrateFrom` is removed.
     */
    keepSource?: boolean
}

export class ForgeTimers extends ForgeExtension {
    name = "ForgeTimers"
    description = description
    version = version

    public timersManager!: TimersManager

    public ready!: Promise<boolean>

    public constructor(public readonly options: IForgeTimersOptions = {}) {
        super()
        this.requireExtensions = [options.storage === "quorieldb" ? "QuorielDB" : "forge.db"]
    }

    public init(client: ForgeClient) {
        this.load(path.resolve(__dirname, "native"))
        this.ready = this._open(client)
        this.timersManager = new TimersManager(client)
    }

    private async _open(client: ForgeClient) {
        const storage = this.options.storage ?? "forgedb"

        try {
            await Database.use(storage)
        } catch (err) {
            Logger.error(err)
            return false
        }

        const { migrateFrom, keepSource } = this.options
        if (migrateFrom) await migrateTimers(client, migrateFrom, storage, keepSource)

        return true
    }
}

export * from "./managers"
export * from "./structures"
export * from "./types"
export * from "./functions/snapshotVars"
export * from "./functions/migrate"