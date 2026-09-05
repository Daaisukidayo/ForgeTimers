import { DataBaseManager } from "@tryforge/forge.db"
import { DataSource, EntitySchema, EntitySchemaColumnOptions, FindOptionsWhere, MongoRepository } from "typeorm"
import { ITimer, MongoTimer, Timer, TimerKind } from "../Timer"
import { IDeleteResult, ITimerFindOptions, ITimerStore } from "./ITimerStore"

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
    timestamp: { type: "bigint", transformer: numeric },
    fireAt: { type: "bigint", transformer: numeric },
    guildID: { type: "varchar", nullable: true },
    channelID: { type: "varchar", nullable: true },
    hostID: { type: "varchar", nullable: true },
    messageID: { type: "varchar", nullable: true },
    args: { type: "simple-json", nullable: true },
    vars: { type: "simple-json", nullable: true },
}

const TimerSchema = new EntitySchema<ITimer>({
    name: "Timer",
    tableName: "timer",
    target: Timer,
    columns,
})

const MongoTimerSchema = new EntitySchema<MongoTimer>({
    name: "MongoTimer",
    tableName: "mongo_timer",
    target: MongoTimer,
    columns: { mongoId: { type: String, objectId: true }, ...columns },
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
    }

    public async destroy() {
        if (this.source?.isInitialized) await this.source.destroy()
    }

    private get repository() {
        return this.source.getRepository(this.entity)
    }

    public async get(kind: TimerKind, name: string) {
        return (await this.repository.findOneBy({ id: Timer.idOf(kind, name) })) as Timer | null
    }

    public async getAll() {
        return (await this.repository.find()) as Timer[]
    }

    public async getAllOf(kind: TimerKind) {
        return (await this.repository.findBy({ kind })) as Timer[]
    }

    public async find(data?: ITimerFindOptions, amount?: number) {
        const where = data as FindOptionsWhere<ITimer> | undefined
        return (await this.repository.find({ where, take: amount })) as Timer[]
    }

    public async set(timer: Timer) {
        const oldData = await this.get(timer.kind, timer.name)

        if (oldData && this.type === "mongodb") {
            // has to be an object
            await this.repository.update({ id: oldData.id }, timer as never)
            return
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