import { EventManager, ForgeClient, ForgeExtension } from "@tryforge/forgescript"
import { EventEmitter } from "node:events"
import { HANDLER, TimerCommandManager, TimersManager } from "./managers"
import { Database, TimerKind, TimerStorage } from "./structures"
import { IForgeTimersOptions, ITimerEvents, ITimerOverrides, TimerEvent } from "./types"
import { Logger } from "./functions/logger"
import { emitSafely } from "./functions/emit"
import { description, version } from "../package.json"
import path from "path"

declare module "@tryforge/forgescript" {
    interface ForgeClient {
        crons: Map<string, NodeJS.Timeout>
    }
}

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
        this.requireExtensions = [Database.extensionOf(options.storage ?? "forgedb")]
    }

    /**
     * The extension on a client. Throws when it isn't loaded.
     * @param client Client to look on.
     */
    public static of(client: ForgeClient) {
        return client.getExtension(ForgeTimers, true)
    }

    /**
     * Config of a kind, `{}` when none was given.
     * @param kind Timer kind.
     */
    public configOf(kind: TimerKind): ITimerOverrides {
        const { timeoutConfig, intervalConfig, cronConfig } = this.options
        const configs = { timeout: timeoutConfig, interval: intervalConfig, cron: cronConfig }

        // a stored kind can be anything, toString too
        return (Object.hasOwn(configs, kind) && configs[kind]) || {}
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

        client.crons = new Map()
        this.timersManager = new TimersManager(client)
    }

    private async _open(client: ForgeClient) {
        const storage = this.options.storage ?? "forgedb"

        try {
            await Database.use(storage)
        } catch (err) {
            Logger.error(err)
            const reason = err instanceof Error ? err.message : String(err)

            emitSafely(this.emitter, TimerEvent.databaseFail, { event: { failReason: reason } })
            return false
        }

        emitSafely(this.emitter, TimerEvent.databaseConnect, {})

        const { migrateFrom, keepSource } = this.options
        if (!migrateFrom) return true

        const needed = Database.extensionOf(migrateFrom)
        if (client.options.extensions?.some((extension) => extension.name === needed)) {
            await Database.migrate(migrateFrom, keepSource)
        } else {
            Logger.error(
                `Cannot migrate from "${migrateFrom}": the ${needed} extension is not loaded. ` +
                    "Keep it in `extensions` for one boot, then remove it."
            )
        }

        return true
    }

    private _reviewOptions() {
        const { storage, migrateFrom, events } = this.options
        const backends: TimerStorage[] = ["forgedb", "quorieldb"]

        for (const [option, value] of Object.entries({ storage, migrateFrom })) {
            if (value !== undefined && !backends.includes(value)) {
                Logger.warn(
                    `${option}: "${value}" is not a backend. ForgeDB is used instead. Pick one of: ${backends.join(", ")}.`
                )
            }
        }

        for (const kind of Object.values(TimerKind)) {
            const config = this.configOf(kind)

            const max = config.maxOverdue
            if (max !== undefined && max < 0) {
                Logger.warn(
                    `${kind}Config.maxOverdue is ${max}, which throws away every ${kind} that comes back late. Use 0, or leave it out, for no limit.`
                )
            }

            if (kind === TimerKind.timeout) continue

            const limit = config.restoredTicksLimit
            if (limit !== undefined && limit < 0) {
                Logger.warn(
                    `${kind}Config.restoredTicksLimit is ${limit}, which replays nothing. Use Infinity to replay everything it missed.`
                )
            }
        }

        for (const event of events ?? []) {
            if (!Object.hasOwn(TimerEvent, event)) {
                Logger.warn(`"${event}" is not a timer event.`)
            }
        }
    }
}

export * from "./managers"
export * from "./structures"
export * from "./types"
