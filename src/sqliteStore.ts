import Database from "better-sqlite3"
import { mkdirSync } from "fs"
import { dirname, join } from "path"
import { IPersistedTimer, ITimersStore, TimerKind, TimersStores } from "./timersStore"

export const TIMERS_DB = join(process.cwd(), ".forge", "timers.db")

function openDatabase(path: string) {
    mkdirSync(dirname(path), { recursive: true })
    const db = new Database(path)

    db.pragma("journal_mode = WAL")
    db.pragma("synchronous = NORMAL")

    db.exec(`
        CREATE TABLE IF NOT EXISTS timers (
            kind    TEXT    NOT NULL,
            id      TEXT    NOT NULL,
            fire_at INTEGER NOT NULL,
            data    TEXT    NOT NULL,
            PRIMARY KEY (kind, id)
        );
        CREATE INDEX IF NOT EXISTS timers_fire_at ON timers (kind, fire_at);
    `)

    return db
}


export class SQLiteTimersStore implements ITimersStore {
    private readonly selectAll: Database.Statement
    private readonly upsert: Database.Statement
    private readonly remove: Database.Statement
    private readonly removeAll: Database.Statement

    constructor(
        private readonly db: Database.Database,
        private readonly kind: TimerKind
    ) {
        this.selectAll = db.prepare("SELECT data FROM timers WHERE kind = ?")
        this.upsert = db.prepare(
            `INSERT INTO timers (kind, id, fire_at, data) VALUES (@kind, @id, @fireAt, @data)
             ON CONFLICT (kind, id) DO UPDATE SET fire_at = @fireAt, data = @data`
        )
        this.remove = db.prepare("DELETE FROM timers WHERE kind = ? AND id = ?")
        this.removeAll = db.prepare("DELETE FROM timers WHERE kind = ?")
    }

    public async load(): Promise<IPersistedTimer[]> {
        const rows = this.selectAll.all(this.kind) as { data: string }[]
        const out: IPersistedTimer[] = []

        for (const row of rows) {
            try {
                out.push(JSON.parse(row.data) as IPersistedTimer)
            } catch {
                // A single unreadable row shouldn't take the rest down
                continue
            }
        }

        return out
    }

    public async save(record: IPersistedTimer): Promise<void> {
        this.upsert.run({
            kind: this.kind,
            id: record.id,
            fireAt: record.fireAt,
            data: JSON.stringify(record),
        })
    }

    public async delete(id: string): Promise<void> {
        this.remove.run(this.kind, id)
    }

    public async clear(): Promise<void> {
        this.removeAll.run(this.kind)
    }
}

/** Builds a store per timer kind, all sharing one database connection */
export function createSQLiteStores(path = TIMERS_DB): TimersStores {
    const db = openDatabase(path)
    return new Map(Object.values(TimerKind).map((kind) => [kind, new SQLiteTimersStore(db, kind)]))
}