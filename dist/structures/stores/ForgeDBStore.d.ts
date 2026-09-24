import { DataBaseManager } from "@tryforge/forge.db";
import { EntitySchema } from "typeorm";
import { ITimer, MongoTimer, Timer, TimerKind } from "../Timer";
import { IDeleteResult, ITimerStore } from "./ITimerStore";
export declare const TimerSchema: EntitySchema<ITimer>;
export declare const MongoTimerSchema: EntitySchema<MongoTimer>;
export type AnyTimer = EntitySchema<ITimer> | EntitySchema<MongoTimer>;
/** Keeps timers in whatever database ForgeDB already uses, be it sqlite, postgres, mysql or mongodb */
export declare class ForgeDBStore extends DataBaseManager implements ITimerStore {
    database: string;
    entityManager: {
        sqlite: EntitySchema<ITimer>[];
        mongodb: EntitySchema<MongoTimer>[];
        mysql: EntitySchema<ITimer>[];
        postgres: EntitySchema<ITimer>[];
    };
    private readonly connecting;
    private source;
    private entity;
    constructor();
    init(): Promise<void>;
    private useWriteAheadLog;
    destroy(): Promise<void>;
    private get repository();
    /**
     * Mongo rows from before 2.0.0 keep the author under hostID. Mongo can't alias a column, it gets read here.
     * @param timer Row as read, or null.
     */
    private static fold;
    get(kind: TimerKind, name: string): Promise<Timer | null>;
    getAll(): Promise<Timer[]>;
    getAllOf(kind: TimerKind): Promise<Timer[]>;
    set(timer: Timer): Promise<void>;
    delete(kind: TimerKind, name: string): Promise<IDeleteResult>;
    wipe(): Promise<void>;
}
//# sourceMappingURL=ForgeDBStore.d.ts.map