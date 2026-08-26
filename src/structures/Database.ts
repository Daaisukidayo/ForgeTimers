import { TimersDatabaseManager } from "../managers"
import { DataSource, FindOptionsWhere } from "typeorm"
import { MongoTimer, Timer, TimerKind } from "./Timer"

export type AnyTimer = typeof Timer | typeof MongoTimer
export type ITimerFindOptions = FindOptionsWhere<Timer>

export class Database extends TimersDatabaseManager {
    public database = "timers.db"

    public entityManager = {
        sqlite: [Timer],
        mongodb: [MongoTimer],
        mysql: [Timer],
        postgres: [Timer],
    }

    public static entities: {
        Timer: AnyTimer
    }

    private db: Promise<DataSource>
    private static db: DataSource

    constructor() {
        super()
        this.db = this.getDB()
    }

    public async init() {
        Database.db = await this.db

        const type = this.type ?? "sqlite"
        Database.entities = {
            Timer: this.entityManager[type === "better-sqlite3" ? "sqlite" : type][0] as AnyTimer,
        }
    }

    /**
     * Gets an existing timer.
     * @param kind The kind of the timer to get.
     * @param name The name of the timer to get.
     * @returns
     */
    public static async get(kind: TimerKind, name: string) {
        return await this.db.getRepository(this.entities.Timer).findOneBy({ id: Timer.idOf(kind, name) })
    }

    /**
     * Gets all existing timers.
     * @returns
     */
    public static async getAll() {
        return await this.db.getRepository(this.entities.Timer).find()
    }

    /**
     * Gets all existing timers of a kind.
     * @param kind The kind of the timers to get.
     * @returns
     */
    public static async getAllOf(kind: TimerKind) {
        return await this.db.getRepository(this.entities.Timer).findBy({ kind })
    }

    /**
     * Finds existing timers matching the provided data.
     * @param data The data to use for searching.
     * @param amount The amount of results to return.
     * @returns
     */
    public static async find(data?: ITimerFindOptions, amount?: number) {
        return await this.db.getRepository(this.entities.Timer).find({ where: data, take: amount })
    }

    /**
     * Saves a timer in the database.
     * @param data The timer data to save.
     */
    public static async set(data: Timer | MongoTimer) {
        const oldData = await this.get(data.kind, data.name)

        if (oldData && this.type === "mongodb") {
            await this.db.getRepository(this.entities.Timer).update(oldData.id, data as any)
        } else {
            await this.db.getRepository(this.entities.Timer).save(data)
        }
    }

    /**
     * Deletes an existing timer from the database.
     * @param kind The kind of the timer to delete.
     * @param name The name of the timer to delete.
     * @returns
     */
    public static async delete(kind: TimerKind, name: string) {
        return await this.db.getRepository(this.entities.Timer).delete({ id: Timer.idOf(kind, name) })
    }

    /**
     * Wipes the entire database.
     * @returns
     */
    public static async wipe() {
        return await this.db.getRepository(this.entities.Timer).clear()
    }
}