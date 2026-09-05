import { Timer, TimerKind } from "./Timer"
import { ITimerFindOptions, ITimerStore } from "./stores"

/** Which extension holds the timers */
export type TimerStorage = "forgedb" | "quorieldb"

/**
 * The database, whichever one was picked. Everything reads and writes timers through here,
 * so the backend is a single decision made at startup rather than a shape the rest has to know.
 */
export class Database {
    private static store?: ITimerStore

    /**
     * Opens a storage without putting it in charge, so two can be read at once.
     * @param storage Which backend to open.
     */
    public static async open(storage: TimerStorage = "forgedb"): Promise<ITimerStore> {
        const store = load(storage)
        await store.init()

        return store
    }

    /**
     * Opens the chosen storage and makes it the one everything reads. Replaces whatever was open before.
     * @param storage Which backend to keep timers in.
     */
    public static async use(storage: TimerStorage = "forgedb") {
        await this.store?.destroy().catch(() => undefined)
        this.store = await this.open(storage)

        return this.store
    }

    /** The open store. Reaching it before {@link use} means an ordering bug, not a missing timer */
    private static get current() {
        if (!this.store) throw new Error("The timer database has not been opened yet.")
        return this.store
    }

    /**
     * Closes the storage. For a graceful shutdown.
     */
    public static async destroy() {
        await this.store?.destroy()
        this.store = undefined
    }

    /**
     * Gets an existing timer.
     * @param kind The kind of the timer to get.
     * @param name The name of the timer to get.
     */
    public static async get(kind: TimerKind, name: string) {
        return await this.current.get(kind, name)
    }

    /**
     * Gets all existing timers.
     */
    public static async getAll() {
        return await this.current.getAll()
    }

    /**
     * Gets all existing timers of a kind.
     * @param kind The kind of the timers to get.
     */
    public static async getAllOf(kind: TimerKind) {
        return await this.current.getAllOf(kind)
    }

    /**
     * Finds existing timers matching the provided data.
     * @param data The data to use for searching.
     * @param amount The amount of results to return.
     */
    public static async find(data?: ITimerFindOptions, amount?: number) {
        return await this.current.find(data, amount)
    }

    /**
     * Saves a timer in the database.
     * @param timer The timer to save.
     */
    public static async set(timer: Timer) {
        await this.current.set(timer)
    }

    /**
     * Deletes an existing timer from the database.
     * @param kind The kind of the timer to delete.
     * @param name The name of the timer to delete.
     */
    public static async delete(kind: TimerKind, name: string) {
        return await this.current.delete(kind, name)
    }

    /**
     * Wipes every stored timer.
     */
    public static async wipe() {
        await this.current.wipe()
    }
}

/** Named in the error when a backend's packages turn out not to be installed */
const INSTALL: Record<TimerStorage, string> = {
    forgedb: "@tryforge/forge.db",
    quorieldb: "@quoriel/db",
}

/**
 * Required on the way in, so a backend's dependencies only cost whoever picked it.
 */
function load(storage: TimerStorage): ITimerStore {
    try {
        if (storage === "quorieldb") {
            const { QuorielDBStore } = require("./stores/QuorielDBStore") as typeof import("./stores/QuorielDBStore")
            return new QuorielDBStore()
        }

        const { ForgeDBStore } = require("./stores/ForgeDBStore") as typeof import("./stores/ForgeDBStore")
        return new ForgeDBStore()
    } catch (err) {
        throw new Error(
            `storage: "${storage}" could not be opened. If ${INSTALL[storage]} is not installed, ` +
                `run \`npm i ${INSTALL[storage]}\`.\nThe loader said: ` +
                (err instanceof Error ? err.message : String(err))
        )
    }
}