import { Timer, TimerKind } from "./Timer";
import { ITimerStore } from "./stores";
/** Which extension holds the timers */
export type TimerStorage = "forgedb" | "quorieldb";
export declare class Database {
    private static store?;
    /**
     * Opens a storage without putting it in charge.
     * @param storage Which backend to open.
     */
    static open(storage?: TimerStorage): Promise<ITimerStore>;
    /**
     * Opens the chosen storage and makes it the one everything reads. Replaces whatever was open before.
     * @param storage Which backend to keep timers in.
     */
    static use(storage?: TimerStorage): Promise<ITimerStore>;
    /** The open store. */
    private static get current();
    /**
     * Closes the storage.
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