import type * as QuorielDB from "@quoriel/db"
import { ITimer, Timer, TimerKind } from "../Timer"
import { IDeleteResult, ITimerFindOptions, ITimerStore } from "./ITimerStore"

/** The QuorielDB record type timers live under */
export const QUORIEL_TYPE = "timers"

/** No entity to derive a key from, so the id is the key */
const SCHEMA: QuorielDB.TypeSchema = { type: null, guild: false }

/** Keeps timers in QuorielDB's LMDB store, under its own record type */
export class QuorielDBStore implements ITimerStore {
    private db!: typeof QuorielDB

    public async init() {
        this.db = load()

        // registering opens the store, and keeps the type out of the user's config file
        if (!this.db.registerDB(QUORIEL_TYPE, SCHEMA)) {
            throw new Error(`QuorielDB refused the "${QUORIEL_TYPE}" record type.`)
        }
    }

    public async destroy() {
        // a second store may have closed it already, and closing it twice throws
        if (this.db?.activeDB().includes(QUORIEL_TYPE)) await this.db.closeDB([QUORIEL_TYPE])
    }

    public async get(kind: TimerKind, name: string) {
        // a missing record reads back as {}
        const row = this.db.getRecord(QUORIEL_TYPE, Timer.idOf(kind, name))
        return row?.id ? Timer.from(row as ITimer) : null
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

function load(): typeof QuorielDB {
    try {
        return require("@quoriel/db") as typeof QuorielDB
    } catch {
        throw new Error('storage: "quorieldb" needs the QuorielDB extension. Install it with `npm i @quoriel/db lmdb`.')
    }
}
