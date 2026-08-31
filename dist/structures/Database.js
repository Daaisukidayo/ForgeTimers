"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const managers_1 = require("../managers");
const Timer_1 = require("./Timer");
class Database extends managers_1.TimersDatabaseManager {
    database = "timers.db";
    entityManager = {
        sqlite: [Timer_1.Timer],
        mongodb: [Timer_1.MongoTimer],
        mysql: [Timer_1.Timer],
        postgres: [Timer_1.Timer],
    };
    static entities;
    db;
    static db;
    constructor() {
        super();
        this.db = this.getDB();
    }
    async init() {
        Database.db = await this.db;
        const type = this.type ?? "sqlite";
        Database.entities = {
            Timer: this.entityManager[type === "better-sqlite3" ? "sqlite" : type][0],
        };
    }
    /**
     * Gets an existing timer.
     * @param kind The kind of the timer to get.
     * @param name The name of the timer to get.
     * @returns
     */
    static async get(kind, name) {
        return await this.db.getRepository(this.entities.Timer).findOneBy({ id: Timer_1.Timer.idOf(kind, name) });
    }
    /**
     * Gets all existing timers.
     * @returns
     */
    static async getAll() {
        return await this.db.getRepository(this.entities.Timer).find();
    }
    /**
     * Gets all existing timers of a kind.
     * @param kind The kind of the timers to get.
     * @returns
     */
    static async getAllOf(kind) {
        return await this.db.getRepository(this.entities.Timer).findBy({ kind });
    }
    /**
     * Finds existing timers matching the provided data.
     * @param data The data to use for searching.
     * @param amount The amount of results to return.
     * @returns
     */
    static async find(data, amount) {
        return await this.db.getRepository(this.entities.Timer).find({ where: data, take: amount });
    }
    /**
     * Saves a timer in the database.
     * @param data The timer data to save.
     */
    static async set(data) {
        const oldData = await this.get(data.kind, data.name);
        if (oldData && this.type === "mongodb") {
            // has to be an object
            await this.db.getRepository(this.entities.Timer).update({ id: oldData.id }, data);
        }
        else {
            await this.db.getRepository(this.entities.Timer).save(data);
        }
    }
    /**
     * Deletes an existing timer from the database.
     * @param kind The kind of the timer to delete.
     * @param name The name of the timer to delete.
     * @returns
     */
    static async delete(kind, name) {
        return await this.db.getRepository(this.entities.Timer).delete({ id: Timer_1.Timer.idOf(kind, name) });
    }
    /**
     * Wipes the entire database. Deletes rather than truncating, which would need raised
     * privileges on postgres.
     * @returns
     */
    static async wipe() {
        const repository = this.db.getRepository(this.entities.Timer);
        if (this.type === "mongodb")
            return await repository.deleteMany({});
        return await repository.deleteAll();
    }
}
exports.Database = Database;
//# sourceMappingURL=Database.js.map