import { readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { Logger } from "../../functions/logger"
import { ITimer, Timer, TimerKind } from "../Timer"
import { IDeleteResult, ITimerFindOptions, ITimerStore } from "./ITimerStore"

/** The QuorielDB record type timers live under */
export const QUORIEL_TYPE = "timers"

interface IQuorielDB {
    reloadDB(): Promise<void>
    openDB(types: string[]): void
    closeDB(types: string[]): Promise<void>
    rangeDB(type: string): Array<{ key: string; value: unknown }>
    getRecord(type: string, key: string): Record<string, unknown>
    putRecord(type: string, key: string, data: object): Promise<boolean>
    removeRecord(type: string, key: string): Promise<void>
    existsRecord(type: string, key: string): boolean
}

/** Keeps timers in QuorielDB's LMDB store, under its own record type */
export class QuorielDBStore implements ITimerStore {
    private db!: IQuorielDB

    public async init() {
        this.db = load()

        // creates quoriel/db and its config
        await this.db.reloadDB()
        if (await this.register()) await this.db.reloadDB()

        this.db.openDB([QUORIEL_TYPE])
    }

    public async destroy() {
        await this.db?.closeDB([QUORIEL_TYPE])
    }

    /** QuorielDB only opens types its config knows, so put ours there once */
    private async register() {
        const file = join(process.cwd(), "quoriel", "db", "config.json")
        const config = JSON.parse(await readFile(file, "utf8"))

        if (config.types?.[QUORIEL_TYPE]) return false

        // no entity to derive a key from, the id is the key
        config.types = { ...config.types, [QUORIEL_TYPE]: { type: null, guild: false } }

        // rename rather than write in place
        await writeFile(`${file}.tmp`, JSON.stringify(config, null, 4), "utf8")
        await rename(`${file}.tmp`, file)

        Logger.info(`Registered the "${QUORIEL_TYPE}" record type in quoriel/db/config.json`)
        return true
    }

    public async get(kind: TimerKind, name: string) {
        // a missing record reads back as {}, so the id is what says it was really there
        const row = this.db.getRecord(QUORIEL_TYPE, Timer.idOf(kind, name))
        return row?.id ? Timer.from(row as unknown as ITimer) : null
    }

    public async getAll() {
        return this.db.rangeDB(QUORIEL_TYPE).map((entry) => Timer.from(entry.value as ITimer))
    }

    public async getAllOf(kind: TimerKind) {
        return (await this.getAll()).filter((timer) => timer.kind === kind)
    }

    public async find(data?: ITimerFindOptions, amount?: number) {
        const wanted = Object.entries(data ?? {})
        const found = (await this.getAll()).filter((timer) =>
            wanted.every(([key, value]) => timer[key as keyof Timer] === value)
        )

        return amount === undefined ? found : found.slice(0, amount)
    }

    public async set(timer: Timer) {
        // lmdb keeps the object as it is
        await this.db.putRecord(QUORIEL_TYPE, timer.id, { ...timer })
    }

    public async delete(kind: TimerKind, name: string): Promise<IDeleteResult> {
        const key = Timer.idOf(kind, name)
        if (!this.db.existsRecord(QUORIEL_TYPE, key)) return { affected: 0 }

        await this.db.removeRecord(QUORIEL_TYPE, key)
        return { affected: 1 }
    }

    public async wipe() {
        for (const entry of this.db.rangeDB(QUORIEL_TYPE)) {
            await this.db.removeRecord(QUORIEL_TYPE, entry.key)
        }
    }
}

/** Kept out of the import graph so ForgeDB users never need @quoriel/db installed */
function load(): IQuorielDB {
    try {
        return require("@quoriel/db") as IQuorielDB
    } catch {
        throw new Error(
            'storage: "quorieldb" needs the QuorielDB extension. Install it with `npm i @quoriel/db lmdb`.'
        )
    }
}