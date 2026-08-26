import { ForgeClient, ForgeExtension } from "@tryforge/forgescript"
import { TimersManager } from "./managers"
import { Database } from "./structures"
import { IIntervalConfig, ITimeoutConfig } from "./types"
import noop from "./functions/noop"
import { description, version } from "../package.json"
import path from "path"

export interface IForgeTimersOptions {
    timeoutConfig?: ITimeoutConfig
    intervalConfig?: IIntervalConfig
}

export class ForgeTimers extends ForgeExtension {
    name = "forge.timers"
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
                noop(err)
                return false
            })
        this.timersManager = new TimersManager(client)
    }
}

export * from "./managers"
export * from "./structures"
export * from "./types"
export * from "./functions/snapshotVars"