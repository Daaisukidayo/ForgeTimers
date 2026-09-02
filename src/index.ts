import { ForgeClient, ForgeExtension } from "@tryforge/forgescript"
import { TimersManager } from "./managers"
import { Database } from "./structures"
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
}

export class ForgeTimers extends ForgeExtension {
    name = "ForgeTimers"
    description = description
    version = version
    requireExtensions = ["forge.db"]

    public timersManager!: TimersManager

    public ready!: Promise<boolean>

    public constructor(public readonly options: IForgeTimersOptions = {}) {
        super()
    }

    public init(client: ForgeClient) {
        this.load(path.resolve(__dirname, "native"))
        this.ready = new Database()
            .init()
            .then(() => true)
            .catch((err) => {
                Logger.error(err)
                return false
            })
        this.timersManager = new TimersManager(client)
    }
}

export * from "./managers"
export * from "./structures"
export * from "./types"
export * from "./functions/snapshotVars"