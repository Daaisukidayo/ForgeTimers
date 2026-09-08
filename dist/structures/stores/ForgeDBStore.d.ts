import { DataBaseManager } from "@tryforge/forge.db";
import { EntitySchema } from "typeorm";
import { ITimer, MongoTimer, Timer, TimerKind } from "../Timer";
import { IDeleteResult, ITimerFindOptions, ITimerStore } from "./ITimerStore";
export type AnyTimer = EntitySchema<ITimer> | EntitySchema<MongoTimer>;
/** Keeps timers in whatever ForgeDB is already connected to: sqlite, postgres, mysql or mongodb */
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
    destroy(): Promise<void>;
    private get repository();
    get(kind: TimerKind, name: string): Promise<Timer | null>;
    getAll(): Promise<Timer[]>;
    getAllOf(kind: TimerKind): Promise<Timer[]>;
    find(data?: ITimerFindOptions, amount?: number): Promise<Timer[]>;
    set(timer: Timer): Promise<void>;
    delete(kind: TimerKind, name: string): Promise<IDeleteResult>;
    wipe(): Promise<void>;
}
//# sourceMappingURL=ForgeDBStore.d.ts.map