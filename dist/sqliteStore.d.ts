import Database from "better-sqlite3";
import { IPersistedTimer, ITimersStore, TimerKind, TimersStores } from "./timersStore";
export declare const TIMERS_DB: string;
export declare class SQLiteTimersStore implements ITimersStore {
    private readonly db;
    private readonly kind;
    private readonly selectAll;
    private readonly upsert;
    private readonly remove;
    private readonly removeAll;
    constructor(db: Database.Database, kind: TimerKind);
    load(): Promise<IPersistedTimer[]>;
    save(record: IPersistedTimer): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
}
/** Builds a store per timer kind, all sharing one database connection */
export declare function createSQLiteStores(path?: string): TimersStores;
//# sourceMappingURL=sqliteStore.d.ts.map