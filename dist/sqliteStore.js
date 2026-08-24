"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SQLiteTimersStore = exports.TIMERS_DB = void 0;
exports.createSQLiteStores = createSQLiteStores;
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs_1 = require("fs");
const path_1 = require("path");
const timersStore_1 = require("./timersStore");
exports.TIMERS_DB = (0, path_1.join)(process.cwd(), ".forge", "timers.db");
function openDatabase(path) {
    (0, fs_1.mkdirSync)((0, path_1.dirname)(path), { recursive: true });
    const db = new better_sqlite3_1.default(path);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.exec(`
        CREATE TABLE IF NOT EXISTS timers (
            kind    TEXT    NOT NULL,
            id      TEXT    NOT NULL,
            fire_at INTEGER NOT NULL,
            data    TEXT    NOT NULL,
            PRIMARY KEY (kind, id)
        );
        CREATE INDEX IF NOT EXISTS timers_fire_at ON timers (kind, fire_at);
    `);
    return db;
}
class SQLiteTimersStore {
    db;
    kind;
    selectAll;
    upsert;
    remove;
    removeAll;
    constructor(db, kind) {
        this.db = db;
        this.kind = kind;
        this.selectAll = db.prepare("SELECT data FROM timers WHERE kind = ?");
        this.upsert = db.prepare(`INSERT INTO timers (kind, id, fire_at, data) VALUES (@kind, @id, @fireAt, @data)
             ON CONFLICT (kind, id) DO UPDATE SET fire_at = @fireAt, data = @data`);
        this.remove = db.prepare("DELETE FROM timers WHERE kind = ? AND id = ?");
        this.removeAll = db.prepare("DELETE FROM timers WHERE kind = ?");
    }
    async load() {
        const rows = this.selectAll.all(this.kind);
        const out = [];
        for (const row of rows) {
            try {
                out.push(JSON.parse(row.data));
            }
            catch {
                // A single unreadable row shouldn't take the rest down
                continue;
            }
        }
        return out;
    }
    async save(record) {
        this.upsert.run({
            kind: this.kind,
            id: record.id,
            fireAt: record.fireAt,
            data: JSON.stringify(record),
        });
    }
    async delete(id) {
        this.remove.run(this.kind, id);
    }
    async clear() {
        this.removeAll.run(this.kind);
    }
}
exports.SQLiteTimersStore = SQLiteTimersStore;
/** Builds a store per timer kind, all sharing one database connection */
function createSQLiteStores(path = exports.TIMERS_DB) {
    const db = openDatabase(path);
    return new Map(Object.values(timersStore_1.TimerKind).map((kind) => [kind, new SQLiteTimersStore(db, kind)]));
}
//# sourceMappingURL=sqliteStore.js.map