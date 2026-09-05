import { Timer, TimerKind } from "./Timer";
import { ITimerFindOptions, ITimerStore } from "./stores";
/** Which extension holds the timers */
export type TimerStorage = "forgedb" | "quorieldb";
/**
 * The database, whichever one was picked. Everything reads and writes timers through here,
 * so the backend is a single decision made at startup rather than a shape the rest has to know.
 */
export declare class Database {
    private static store?;
    /**
     * Opens a storage without putting it in charge, so two can be read at once.
     * @param storage Which backend to open.
     */
    static open(storage?: TimerStorage): Promise<ITimerStore>;
    /**
     * Opens the chosen storage and makes it the one everything reads. Replaces whatever was open before.
     * @param storage Which backend to keep timers in.
     */
    static use(storage?: TimerStorage): Promise<ITimerStore>;
    /** The open store. Reaching it before {@link use} means an ordering bug, not a missing timer */
    private static get current();
    /**
     * Closes the storage. For a graceful shutdown.
     */
    static destroy(): Promise<void>;
    /**
     * Gets an existing timer.
     * @param kind The kind of the timer to get.
     * @param name The name of the timer to get.
     */
    static get(kind: TimerKind, name: string): Promise<Timer | null>;
    /**
     * Gets all existing timers.
     */
    static getAll(): Promise<Timer[]>;
    /**
     * Gets all existing timers of a kind.
     * @param kind The kind of the timers to get.
     */
    static getAllOf(kind: TimerKind): Promise<Timer[]>;
    /**
     * Finds existing timers matching the provided data.
     * @param data The data to use for searching.
     * @param amount The amount of results to return.
     */
    static find(data?: ITimerFindOptions, amount?: number): Promise<Timer[]>;
    /**
     * Saves a timer in the database.
     * @param timer The timer to save.
     */
    static set(timer: Timer): Promise<void>;
    /**
     * Deletes an existing timer from the database.
     * @param kind The kind of the timer to delete.
     * @param name The name of the timer to delete.
     */
    static delete(kind: TimerKind, name: string): Promise<import("./stores").IDeleteResult>;
    /**
     * Wipes every stored timer.
     */
    static wipe(): Promise<void>;
}
//# sourceMappingURL=Database.d.ts.map