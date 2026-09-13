"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuorielDBStore = exports.QUORIEL_TYPE = void 0;
const Timer_1 = require("../Timer");
/** The QuorielDB record type timers live under */
exports.QUORIEL_TYPE = "timers";
/** No entity to derive a key from, so the id is the key */
const SCHEMA = { type: null, guild: false };
/** Keeps timers in QuorielDB's LMDB store, under its own record type */
class QuorielDBStore {
    db;
    async init() {
        this.db = load();
        // registering opens the store, and keeps the type out of the user's config file
        if (!this.db.registerDB(exports.QUORIEL_TYPE, SCHEMA)) {
            throw new Error(`QuorielDB refused the "${exports.QUORIEL_TYPE}" record type.`);
        }
    }
    async destroy() {
        // a second store may have closed it already, and closing it twice throws
        if (this.db?.activeDB().includes(exports.QUORIEL_TYPE))
            await this.db.closeDB([exports.QUORIEL_TYPE]);
    }
    async get(kind, name) {
        // a missing record reads back as {}
        const row = this.db.getRecord(exports.QUORIEL_TYPE, Timer_1.Timer.idOf(kind, name));
        return row?.id ? Timer_1.Timer.from(row) : null;
    }
    async getAll() {
        return this.db.rangeDB(exports.QUORIEL_TYPE).map((entry) => Timer_1.Timer.from(entry.value));
    }
    async getAllOf(kind) {
        return (await this.getAll()).filter((timer) => timer.kind === kind);
    }
    async set(timer) {
        // lmdb keeps the object as it is
        await this.db.putRecord(exports.QUORIEL_TYPE, timer.id, { ...timer });
    }
    async delete(kind, name) {
        const key = Timer_1.Timer.idOf(kind, name);
        if (!this.db.existsRecord(exports.QUORIEL_TYPE, key))
            return { affected: 0 };
        await this.db.removeRecord(exports.QUORIEL_TYPE, key);
        return { affected: 1 };
    }
    async wipe() {
        for (const entry of this.db.rangeDB(exports.QUORIEL_TYPE)) {
            await this.db.removeRecord(exports.QUORIEL_TYPE, entry.key);
        }
    }
}
exports.QuorielDBStore = QuorielDBStore;
function load() {
    try {
        return require("@quoriel/db");
    }
    catch {
        throw new Error('storage: "quorieldb" needs the QuorielDB extension. Install it with `npm i @quoriel/db lmdb`.');
    }
}
//# sourceMappingURL=QuorielDBStore.js.map