"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeDBStore = exports.MongoTimerSchema = exports.TimerSchema = void 0;
const forge_db_1 = require("@tryforge/forge.db");
const typeorm_1 = require("typeorm");
const Timer_1 = require("../Timer");
const logger_1 = require("../../functions/logger");
/** Epoch ms overflows int32 on mysql and postgres, hence bigint */
const numeric = {
    to: (value) => value,
    from: (value) => (value === null || value === undefined ? value : Number(value)),
};
/** Shared by both entities. */
const columns = {
    id: { type: String, primary: true },
    name: { type: String },
    kind: { type: "varchar" },
    code: { type: "text" },
    path: { type: "text", nullable: true },
    commandName: { type: "text", nullable: true },
    version: { type: "int", nullable: true },
    duration: { type: "bigint", transformer: numeric },
    cron: { type: "text", nullable: true },
    timezone: { type: "varchar", nullable: true },
    timestamp: { type: "bigint", transformer: numeric },
    fireAt: { type: "bigint", transformer: numeric },
    pausedAt: { type: "bigint", nullable: true, transformer: numeric },
    guildID: { type: "varchar", nullable: true },
    channelID: { type: "varchar", nullable: true },
    authorID: { type: "varchar", nullable: true },
    messageID: { type: "varchar", nullable: true },
    args: { type: "simple-json", nullable: true },
    config: { type: "simple-json", nullable: true },
    vars: { type: "simple-json", nullable: true },
};
exports.TimerSchema = new typeorm_1.EntitySchema({
    name: "Timer",
    tableName: "timer",
    target: Timer_1.Timer,
    columns: { ...columns, authorID: { ...columns.authorID, name: "hostID" } },
});
exports.MongoTimerSchema = new typeorm_1.EntitySchema({
    name: "MongoTimer",
    tableName: "mongo_timer",
    target: Timer_1.MongoTimer,
    columns: {
        mongoId: { type: String, objectId: true },
        ...columns,
        hostID: { type: "varchar", nullable: true },
    },
});
/** Keeps timers in whatever database ForgeDB already uses, be it sqlite, postgres, mysql or mongodb */
class ForgeDBStore extends forge_db_1.DataBaseManager {
    database = "timers.db";
    entityManager = {
        sqlite: [exports.TimerSchema],
        mongodb: [exports.MongoTimerSchema],
        mysql: [exports.TimerSchema],
        postgres: [exports.TimerSchema],
    };
    connecting;
    source;
    entity;
    constructor() {
        super();
        this.connecting = this.getDB();
    }
    async init() {
        this.source = await this.connecting;
        // forge.db caches DataSources for the whole process and hands back destroyed ones
        if (!this.source.isInitialized)
            await this.source.initialize();
        const type = this.type ?? "sqlite";
        this.entity = this.entityManager[type === "better-sqlite3" ? "sqlite" : type][0];
        if (type === "sqlite" || type === "better-sqlite3")
            await this.useWriteAheadLog();
    }
    async useWriteAheadLog() {
        try {
            await this.source.query("PRAGMA journal_mode = WAL");
        }
        catch (err) {
            // a network share or a read-only folder refuses it
            logger_1.Logger.warn(`Could not put ${this.database} in write-ahead mode: ${err instanceof Error ? err.message : String(err)}`);
        }
    }
    async destroy() {
        if (this.source?.isInitialized)
            await this.source.destroy();
    }
    get repository() {
        return this.source.getRepository(this.entity);
    }
    /**
     * Mongo rows from before 2.0.0 keep the author under hostID. Mongo can't alias a column, it gets read here.
     * @param timer Row as read, or null.
     */
    static fold(timer) {
        const row = timer;
        if (!row)
            return timer;
        if (row.authorID == null)
            row.authorID = row.hostID ?? null;
        delete row.hostID;
        return timer;
    }
    async get(kind, name) {
        return ForgeDBStore.fold((await this.repository.findOneBy({ id: Timer_1.Timer.idOf(kind, name) })));
    }
    async getAll() {
        return (await this.repository.find()).map((timer) => ForgeDBStore.fold(timer));
    }
    async getAllOf(kind) {
        return (await this.repository.findBy({ kind })).map((timer) => ForgeDBStore.fold(timer));
    }
    async set(timer) {
        if (this.type === "mongodb") {
            const existing = await this.get(timer.kind, timer.name);
            if (existing) {
                // has to be an object
                await this.repository.update({ id: existing.id }, timer);
                return;
            }
        }
        await this.repository.save(timer);
    }
    async delete(kind, name) {
        const result = await this.repository.delete({ id: Timer_1.Timer.idOf(kind, name) });
        return { affected: result.affected ?? 0 };
    }
    async wipe() {
        // mongo inherits deleteAll from the sql manager, where it builds a query it cannot run
        if (this.type === "mongodb") {
            await this.repository.deleteMany({});
            return;
        }
        await this.repository.deleteAll();
    }
}
exports.ForgeDBStore = ForgeDBStore;
//# sourceMappingURL=ForgeDBStore.js.map