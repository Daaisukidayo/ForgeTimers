import { EventManager, ForgeClient, ForgeExtension } from "@tryforge/forgescript"
import { EventEmitter } from "node:events"
import { HANDLER, TimerCommandManager, TimersManager } from "./managers"
import { Database } from "./structures"
import { migrateTimers } from "./functions/migrate"
import { IForgeTimersOptions, ITimerEvents, TimerEvent, TimerStorage } from "./types"
import { Logger } from "./functions/logger"
import { description, version } from "../package.json"
import path from "path"

export class ForgeTimers extends ForgeExtension {
    name = "ForgeTimers"
    description = description
    version = version

    public timersManager!: TimersManager

    public commands!: TimerCommandManager

    public readonly emitter = new EventEmitter<ITimerEvents>()

    public ready!: Promise<boolean>

    public constructor(public readonly options: IForgeTimersOptions = {}) {
        super()
        this.requireExtensions = [options.storage === "quorieldb" ? "QuorielDB" : "forge.db"]
    }

    public init(client: ForgeClient) {
        this._reviewOptions()
        this.load(path.resolve(__dirname, "native"))
        this.commands = new TimerCommandManager(client)

        if (this.options.events?.length) {
            EventManager.load(HANDLER, path.resolve(__dirname, "events"))
            client.events.load(HANDLER, this.options.events)
        }

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

    private _reviewOptions() {
        const { storage, migrateFrom, timeoutConfig, intervalConfig, events } = this.options
        const backends: TimerStorage[] = ["forgedb", "quorieldb"]

        for (const [option, value] of Object.entries({ storage, migrateFrom })) {
            if (value !== undefined && !backends.includes(value)) {
                Logger.warn(
                    `${option}: "${value}" is not a backend. ForgeDB is used instead. Pick one of: ${backends.join(", ")}.`
                )
            }
        }

        for (const [kind, config] of Object.entries({ timeout: timeoutConfig, interval: intervalConfig })) {
            const max = config?.maxOverdue
            if (max !== undefined && max < 0) {
                Logger.warn(
                    `${kind}Config.maxOverdue is ${max}, which throws away every ${kind} that comes back late. Use 0, or leave it out, for no limit.`
                )
            }
        }

        const limit = intervalConfig?.restoredTicksLimit
        if (limit !== undefined && limit < 0) {
            Logger.warn(
                `intervalConfig.restoredTicksLimit is ${limit}, which replays nothing. Use Infinity to replay every missed tick.`
            )
        }

        for (const event of events ?? []) {
            if (!(event in TimerEvent)) Logger.warn(`"${event}" is not a timer event, so nothing will listen to it.`)
        }
    }
}

export * from "./managers"
export * from "./structures"
export * from "./types"
export * from "./functions/snapshotVars"
export * from "./functions/migrate"
