import { TimersDatabaseManager } from "../managers";
import { FindOptionsWhere } from "typeorm";
import { MongoTimer, Timer, TimerKind } from "./Timer";
export type AnyTimer = typeof Timer | typeof MongoTimer;
export type ITimerFindOptions = FindOptionsWhere<Timer>;
export declare class Database extends TimersDatabaseManager {
    database: string;
    entityManager: {
        sqlite: (typeof Timer)[];
        mongodb: (typeof MongoTimer)[];
        mysql: (typeof Timer)[];
        postgres: (typeof Timer)[];
    };
    static entities: {
        Timer: AnyTimer;
    };
    private db;
    private static db;
    constructor();
    init(): Promise<void>;
    /**
     * Gets an existing timer.
     * @param kind The kind of the timer to get.
     * @param name The name of the timer to get.
     * @returns
     */
    static get(kind: TimerKind, name: string): Promise<Timer | null>;
    /**
     * Gets all existing timers.
     * @returns
     */
    static getAll(): Promise<Timer[]>;
    /**
     * Gets all existing timers of a kind.
     * @param kind The kind of the timers to get.
     * @returns
     */
    static getAllOf(kind: TimerKind): Promise<Timer[]>;
    /**
     * Finds existing timers matching the provided data.
     * @param data The data to use for searching.
     * @param amount The amount of results to return.
     * @returns
     */
    static find(data?: ITimerFindOptions, amount?: number): Promise<Timer[]>;
    /**
     * Saves a timer in the database.
     * @param data The timer data to save.
     */
    static set(data: Timer | MongoTimer): Promise<void>;
    /**
     * Deletes an existing timer from the database.
     * @param kind The kind of the timer to delete.
     * @param name The name of the timer to delete.
     * @returns
     */
    static delete(kind: TimerKind, name: string): Promise<import("typeorm").DeleteResult>;
    /**
     * Wipes the entire database. Deletes rather than truncating, which would need raised
     * privileges on postgres.
     * @returns
     */
    static wipe(): Promise<import("typeorm").DeleteResult | import("typeorm/driver/mongodb/typings.js").DeleteResult>;
}
//# sourceMappingURL=Database.d.ts.map