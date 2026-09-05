"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeDBStore = void 0;
const forge_db_1 = require("@tryforge/forge.db");
const typeorm_1 = require("typeorm");
const Timer_1 = require("../Timer");
/** Epoch ms overflows an int32 on mysql and postgres, so these columns are bigint */
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
    timestamp: { type: "bigint", transformer: numeric },
    fireAt: { type: "bigint", transformer: numeric },
    guildID: { type: "varchar", nullable: true },
    channelID: { type: "varchar", nullable: true },
    hostID: { type: "varchar", nullable: true },
    messageID: { type: "varchar", nullable: true },
    args: { type: "simple-json", nullable: true },
    vars: { type: "simple-json", nullable: true },
};
const TimerSchema = new typeorm_1.EntitySchema({
    name: "Timer",
    tableName: "timer",
    target: Timer_1.Timer,
    columns,
});
const MongoTimerSchema = new typeorm_1.EntitySchema({
    name: "MongoTimer",
    tableName: "mongo_timer",
    target: Timer_1.MongoTimer,
    columns: { mongoId: { type: String, objectId: true }, ...columns },
});
/** Keeps timers in whatever ForgeDB is already connected to: sqlite, postgres, mysql or mongodb */
class ForgeDBStore extends forge_db_1.DataBaseManager {
    database = "timers.db";
    entityManager = {
        sqlite: [TimerSchema],
        mongodb: [MongoTimerSchema],
        mysql: [TimerSchema],
        postgres: [TimerSchema],
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
    }
    async destroy() {
        if (this.source?.isInitialized)
            await this.source.destroy();
    }
    get repository() {
        return this.source.getRepository(this.entity);
    }
    async get(kind, name) {
        return (await this.repository.findOneBy({ id: Timer_1.Timer.idOf(kind, name) }));
    }
    async getAll() {
        return (await this.repository.find());
    }
    async getAllOf(kind) {
        return (await this.repository.findBy({ kind }));
    }
    async find(data, amount) {
        const where = data;
        return (await this.repository.find({ where, take: amount }));
    }
    async set(timer) {
        const oldData = await this.get(timer.kind, timer.name);
        if (oldData && this.type === "mongodb") {
            // has to be an object
            await this.repository.update({ id: oldData.id }, timer);
            return;
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