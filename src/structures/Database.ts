import { Timer, TimerKind } from "./Timer"
import { ITimerStore } from "./stores"
import { Logger } from "../functions/logger"

/** Which extension holds the timers */
export type TimerStorage = "forgedb" | "quorieldb"

/** What a migration did */
export interface IMigrationResult {
    moved: number

    /** Names taken in the target, left in the source. */
    skipped: string[]

    /** Source emptied. A rerun would do nothing. */
    drained: boolean
}

export class Database {
    private static store?: ITimerStore

    /** Backend of `store`, the one a migration moves into. */
    private static storage?: TimerStorage

    /**
     * Opens a backend without putting it in charge. A migration reads its source this way.
     * @param storage Backend to open.
     */
    public static async open(storage: TimerStorage = "forgedb"): Promise<ITimerStore> {
        const store = load(storage)
        await store.init()

        return store
    }

    /**
     * Opens a backend and puts it in charge. Closes whatever was open before.
     * @param storage Backend to keep timers in.
     */
    public static async use(storage: TimerStorage = "forgedb") {
        await this.store?.destroy().catch(() => undefined)

        this.store = undefined
        this.storage = undefined

        this.store = await this.open(storage)
        this.storage = backendOf(storage)

        return this.store
    }

    /**
     * Extension a backend needs in `extensions`.
     * @param storage Backend to look up.
     */
    public static extensionOf(storage: TimerStorage) {
        return EXTENSION[backendOf(storage)]
    }

    /**
     * Moves every timer from another backend into the one in use. Each is read back before its original goes.
     * The source's extension has to be loaded, check before calling.
     * Calls the facade `get` and `set`, not `current`. A test patches `get` to lose a write.
     * @param from Backend to move out of.
     * @param keepSource Copy instead of move. The next boot migrates again until `migrateFrom` goes.
     * @returns What moved, or null when it could not run or stopped halfway.
     */
    public static async migrate(from: TimerStorage, keepSource = false): Promise<IMigrationResult | null> {
        const to = this.storage
        if (!to) throw new Error("Open a storage with Database.use before migrating into it.")

        if (backendOf(from) === to) {
            Logger.warn(`Not migrating: "${from}" is already the storage in use.`)
            return null
        }

        let source: ITimerStore
        try {
            source = await this.open(from)
        } catch (err) {
            Logger.error(`Cannot migrate from "${from}":`, err)
            return null
        }

        try {
            const timers = await source.getAll()
            if (!timers.length) return { moved: 0, skipped: [], drained: true }

            Logger.info(`Migrating ${timers.length} timer(s) from "${from}" to "${to}"`)

            const skipped: string[] = []
            let moved = 0

            for (const timer of timers) {
                // already in the target means someone put it there on purpose
                if (await this.get(timer.kind, timer.name)) {
                    skipped.push(timer.id)
                    continue
                }

                await this.set(timer)

                if (!(await this.get(timer.kind, timer.name))) {
                    throw new Error(`${timer.id} did not read back from "${to}", stopping before anything is lost`)
                }

                if (!keepSource) await source.delete(timer.kind, timer.name)
                moved++
            }

            if (skipped.length) {
                Logger.warn(
                    `Left ${skipped.length} timer(s) in "${from}": their names are taken in "${to}" (${skipped.join(", ")})`
                )
            }

            const drained = !keepSource && !skipped.length
            Logger.info(`Migrated ${moved} timer(s) to "${to}"`)

            if (!drained) {
                Logger.warn(
                    `"${from}" still holds timers, so this will run again on the next boot. ` +
                        "Remove `migrateFrom` from the options once you are done."
                )
            }

            return { moved, skipped, drained }
        } catch (err) {
            Logger.error("Migration stopped:", err)
            return null
        } finally {
            await source.destroy().catch(() => undefined)
        }
    }

    /** Store in use. Throws until `use` opened one. */
    private static get current() {
        if (!this.store) throw new Error("The timer database has not been opened yet.")
        return this.store
    }

    /**
     * Closes the store in use.
     */
    public static async destroy() {
        await this.store?.destroy()

        this.store = undefined
        this.storage = undefined
    }

    /**
     * Stored timer, null if there is none.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    public static async get(kind: TimerKind, name: string) {
        return await this.current.get(kind, name)
    }

    /**
     * Every stored timer.
     */
    public static async getAll() {
        return await this.current.getAll()
    }

    /**
     * Stored timers of one kind.
     * @param kind Timer kind.
     */
    public static async getAllOf(kind: TimerKind) {
        return await this.current.getAllOf(kind)
    }

    /**
     * Writes a timer over whatever has its id.
     * @param timer Timer to write.
     */
    public static async set(timer: Timer) {
        await this.current.set(timer)
    }

    /**
     * Deletes a stored timer.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    public static async delete(kind: TimerKind, name: string) {
        return await this.current.delete(kind, name)
    }

    /**
     * Deletes every stored timer.
     */
    public static async wipe() {
        await this.current.wipe()
    }
}

/** Extension each backend needs loaded */
const EXTENSION: Record<TimerStorage, string> = {
    forgedb: "forge.db",
    quorieldb: "QuorielDB",
}

/** Package each backend needs, named when its require fails */
const INSTALL: Record<TimerStorage, string> = {
    forgedb: "@tryforge/forge.db",
    quorieldb: "@quoriel/db",
}

/**
 * Backend a name really opens. Anything unknown falls back to ForgeDB.
 * @param storage Backend asked for.
 */
function backendOf(storage: TimerStorage): TimerStorage {
    return storage === "quorieldb" ? "quorieldb" : "forgedb"
}

/**
 * Module the require actually tripped over.
 * @param err Whatever the require threw.
 * @returns Its name, null when the require failed for another reason.
 */
function missingModule(err: unknown) {
    if (!(err instanceof Error) || (err as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") return null
    return /Cannot find module '([^']+)'/.exec(err.message)?.[1] ?? null
}

/**
 * Required only on the way in. A backend's packages load just for whoever picked it.
 * @param storage Backend to load.
 */
function load(storage: TimerStorage): ITimerStore {
    try {
        if (backendOf(storage) === "quorieldb") {
            const { QuorielDBStore } = require("./stores/QuorielDBStore") as typeof import("./stores/QuorielDBStore")
            return new QuorielDBStore()
        }

        const { ForgeDBStore } = require("./stores/ForgeDBStore") as typeof import("./stores/ForgeDBStore")
        return new ForgeDBStore()
    } catch (err) {
        const wanted = missingModule(err) ?? INSTALL[backendOf(storage)]

        throw new Error(
            `storage: "${storage}" could not be opened. If ${wanted} is not installed, ` +
                `run \`npm i ${wanted}\`.\nThe loader said: ` +
                (err instanceof Error ? err.message : String(err)),
            { cause: err }
        )
    }
}
