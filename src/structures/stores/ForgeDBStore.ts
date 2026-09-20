import { DataBaseManager } from "@tryforge/forge.db"
import { DataSource, EntitySchema, EntitySchemaColumnOptions, MongoRepository } from "typeorm"
import { ITimer, MongoTimer, Timer, TimerKind } from "../Timer"
import { IDeleteResult, ITimerStore } from "./ITimerStore"
import { Logger } from "../../functions/logger"

/** Epoch ms overflows an int32 on mysql and postgres, so these columns are bigint */
const numeric = {
    to: (value?: number) => value,
    from: (value?: string | number | null) => (value === null || value === undefined ? value : Number(value)),
}

/** Shared by both entities. */
const columns: Record<string, EntitySchemaColumnOptions> = {
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
}

export const TimerSchema = new EntitySchema<ITimer>({
    name: "Timer",
    tableName: "timer",
    target: Timer,
    columns: { ...columns, authorID: { ...columns.authorID, name: "hostID" } },
})

export const MongoTimerSchema = new EntitySchema<MongoTimer>({
    name: "MongoTimer",
    tableName: "mongo_timer",
    target: MongoTimer,
    columns: {
        mongoId: { type: String, objectId: true },
        ...columns,
        hostID: { type: "varchar", nullable: true },
    },
})

export type AnyTimer = EntitySchema<ITimer> | EntitySchema<MongoTimer>

/** Keeps timers in whatever ForgeDB is already connected to: sqlite, postgres, mysql or mongodb */
export class ForgeDBStore extends DataBaseManager implements ITimerStore {
    public database = "timers.db"

    public entityManager = {
        sqlite: [TimerSchema],
        mongodb: [MongoTimerSchema],
        mysql: [TimerSchema],
        postgres: [TimerSchema],
    }

    private readonly connecting: Promise<DataSource>

    private source!: DataSource
    private entity!: AnyTimer

    constructor() {
        super()
        this.connecting = this.getDB()
    }

    public async init() {
        this.source = await this.connecting

        // forge.db caches DataSources for the whole process and hands back destroyed ones
        if (!this.source.isInitialized) await this.source.initialize()

        const type = this.type ?? "sqlite"
        this.entity = this.entityManager[type === "better-sqlite3" ? "sqlite" : type][0]

        if (type === "sqlite" || type === "better-sqlite3") await this.useWriteAheadLog()
    }

    private async useWriteAheadLog() {
        try {
            await this.source.query("PRAGMA journal_mode = WAL")
        } catch (err) {
            // a network share or a read-only folder refuses it
            Logger.warn(
                `Could not put ${this.database} in write-ahead mode: ${err instanceof Error ? err.message : String(err)}`
            )
        }
    }

    public async destroy() {
        if (this.source?.isInitialized) await this.source.destroy()
    }

    private get repository() {
        return this.source.getRepository(this.entity)
    }

    /** A mongo document an older build wrote carries the author under hostID, where no column alias reaches */
    private static fold<T extends Timer | null>(timer: T): T {
        const row = timer as (Timer & { hostID?: MongoTimer["hostID"] }) | null
        if (!row) return timer

        if (row.authorID == null) row.authorID = row.hostID ?? null
        delete row.hostID

        return timer
    }

    public async get(kind: TimerKind, name: string) {
        return ForgeDBStore.fold((await this.repository.findOneBy({ id: Timer.idOf(kind, name) })) as Timer | null)
    }

    public async getAll() {
        return ((await this.repository.find()) as Timer[]).map((timer) => ForgeDBStore.fold(timer))
    }

    public async getAllOf(kind: TimerKind) {
        return ((await this.repository.findBy({ kind })) as Timer[]).map((timer) => ForgeDBStore.fold(timer))
    }

    public async set(timer: Timer) {
        if (this.type === "mongodb") {
            const existing = await this.get(timer.kind, timer.name)

            if (existing) {
                // has to be an object
                await this.repository.update({ id: existing.id }, timer as never)
                return
            }
        }

        await this.repository.save(timer)
    }

    public async delete(kind: TimerKind, name: string): Promise<IDeleteResult> {
        const result = await this.repository.delete({ id: Timer.idOf(kind, name) })
        return { affected: result.affected ?? 0 }
    }

    public async wipe() {
        // mongo inherits deleteAll from the sql manager, where it builds a query it cannot run
        if (this.type === "mongodb") {
            await (this.repository as unknown as MongoRepository<ITimer>).deleteMany({})
            return
        }

        await this.repository.deleteAll()
    }
}
