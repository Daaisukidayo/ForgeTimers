import { Timer, TimerKind } from "./Timer";
import { ITimerStore } from "./stores";
/** Which extension holds the timers */
export type TimerStorage = "forgedb" | "quorieldb";
/** What a migration did */
export interface IMigrationResult {
    moved: number;
    /** Names taken in the target, left in the source. */
    skipped: string[];
    /** Source emptied. A rerun would do nothing. */
    drained: boolean;
}
export declare class Database {
    private static store?;
    /** Backend of `store`, the one a migration moves into. */
    private static storage?;
    /**
     * Opens a backend without putting it in charge. A migration reads its source this way.
     * @param storage Backend to open.
     */
    static open(storage?: TimerStorage): Promise<ITimerStore>;
    /**
     * Opens a backend and puts it in charge. Closes whatever was open before.
     * @param storage Backend to keep timers in.
     */
    static use(storage?: TimerStorage): Promise<ITimerStore>;
    /**
     * Extension a backend needs in `extensions`.
     * @param storage Backend to look up.
     */
    static extensionOf(storage: TimerStorage): string;
    /**
     * Moves every timer from another backend into the one in use. Each is read back before its original goes.
     * The source's extension has to be loaded, check before calling.
     * Calls the facade `get` and `set`, not `current`. A test patches `get` to lose a write.
     * @param from Backend to move out of.
     * @param keepSource Copy instead of move. The next boot migrates again until `migrateFrom` goes.
     * @returns What moved, or null when it could not run or stopped halfway.
     */
    static migrate(from: TimerStorage, keepSource?: boolean): Promise<IMigrationResult | null>;
    /** Store in use. Throws until `use` opened one. */
    private static get current();
    /**
     * Closes the store in use.
     */
    static destroy(): Promise<void>;
    /**
     * Stored timer, null if there is none.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    static get(kind: TimerKind, name: string): Promise<Timer | null>;
    /**
     * Every stored timer.
     */
    static getAll(): Promise<Timer[]>;
    /**
     * Stored timers of one kind.
     * @param kind Timer kind.
     */
    static getAllOf(kind: TimerKind): Promise<Timer[]>;
    /**
     * Writes a timer over whatever has its id.
     * @param timer Timer to write.
     */
    static set(timer: Timer): Promise<void>;
    /**
     * Deletes a stored timer.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    static delete(kind: TimerKind, name: string): Promise<import("./stores").IDeleteResult>;
    /**
     * Deletes every stored timer.
     */
    static wipe(): Promise<void>;
}
//# sourceMappingURL=Database.d.ts.map