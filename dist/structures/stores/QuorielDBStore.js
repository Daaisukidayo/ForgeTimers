"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuorielDBStore = exports.QUORIEL_TYPE = void 0;
const promises_1 = require("node:fs/promises");
const node_path_1 = require("node:path");
const logger_1 = require("../../functions/logger");
const Timer_1 = require("../Timer");
/** The QuorielDB record type timers live under */
exports.QUORIEL_TYPE = "timers";
/** Keeps timers in QuorielDB's LMDB store, under its own record type */
class QuorielDBStore {
    db;
    async init() {
        this.db = load();
        // creates quoriel/db and its config
        await this.db.reloadDB();
        if (await this.register())
            await this.db.reloadDB();
        this.db.openDB([exports.QUORIEL_TYPE]);
    }
    async destroy() {
        await this.db?.closeDB([exports.QUORIEL_TYPE]);
    }
    /** QuorielDB only opens types its config knows, so put ours there once */
    async register() {
        const file = (0, node_path_1.join)(process.cwd(), "quoriel", "db", "config.json");
        const config = JSON.parse(await (0, promises_1.readFile)(file, "utf8"));
        if (config.types?.[exports.QUORIEL_TYPE])
            return false;
        // no entity to derive a key from, the id is the key
        config.types = { ...config.types, [exports.QUORIEL_TYPE]: { type: null, guild: false } };
        // rename rather than write in place
        await (0, promises_1.writeFile)(`${file}.tmp`, JSON.stringify(config, null, 4), "utf8");
        await (0, promises_1.rename)(`${file}.tmp`, file);
        logger_1.Logger.info(`Registered the "${exports.QUORIEL_TYPE}" record type in quoriel/db/config.json`);
        return true;
    }
    async get(kind, name) {
        // a missing record reads back as {}, so the id is what says it was really there
        const row = this.db.getRecord(exports.QUORIEL_TYPE, Timer_1.Timer.idOf(kind, name));
        return row?.id ? Timer_1.Timer.from(row) : null;
    }
    async getAll() {
        return this.db.rangeDB(exports.QUORIEL_TYPE).map((entry) => Timer_1.Timer.from(entry.value));
    }
    async getAllOf(kind) {
        return (await this.getAll()).filter((timer) => timer.kind === kind);
    }
    async find(data, amount) {
        const wanted = Object.entries(data ?? {});
        const found = (await this.getAll()).filter((timer) => wanted.every(([key, value]) => timer[key] === value));
        return amount === undefined ? found : found.slice(0, amount);
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
/** Kept out of the import graph so ForgeDB users never need @quoriel/db installed */
function load() {
    try {
        return require("@quoriel/db");
    }
    catch {
        throw new Error('storage: "quorieldb" needs the QuorielDB extension. Install it with `npm i @quoriel/db lmdb`.');
    }
}
//# sourceMappingURL=QuorielDBStore.js.map