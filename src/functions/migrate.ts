import { ForgeClient } from "@tryforge/forgescript"
import { Database, TimerStorage } from "../structures/Database"
import { Logger } from "./logger"

/** What each backend needs loaded before its store can be opened */
const EXTENSION: Record<TimerStorage, string> = {
    forgedb: "forge.db",
    quorieldb: "QuorielDB",
}

export interface IMigrationResult {
    moved: number
    /** Names already taken in the target, left where they were */
    skipped: string[]
    /** Whether the source was drained, and so whether a rerun would be a no-op */
    drained: boolean
}

/**
 * Moves every stored timer from one backend to the other.
 *
 * First copies, second reads the copy back, and only then drops the original.
 *
 * @param client The client both extensions are loaded on.
 * @param from The backend to move timers out of.
 * @param to The backend to move them into.
 * @param keepSource Whether to leave the originals behind instead of dropping them.
 * @returns What was moved, or null if the source could not be opened.
 */
export async function migrateTimers(
    client: ForgeClient,
    from: TimerStorage,
    to: TimerStorage,
    keepSource = false
): Promise<IMigrationResult | null> {
    if (from === to) {
        Logger.warn(`Not migrating: "${from}" is already the storage in use.`)
        return null
    }

    const wanted = EXTENSION[from]
    if (!client.options.extensions?.some((extension) => extension.name === wanted)) {
        Logger.error(
            `Cannot migrate from "${from}": the ${wanted} extension is not loaded. ` +
                `Keep it in \`extensions\` for one boot, then remove it.`
        )
        return null
    }

    let source
    try {
        source = await Database.open(from)
    } catch (err) {
        Logger.error(`Cannot migrate from "${from}":`, err)
        return null
    }

    try {
        const timers = await source.getAll()
        if (!timers.length) return { moved: 0, skipped: [], drained: true }

        Logger.info(`Migrating ${timers.length} timer(s) from "${from}" to "${to}"`)

        const skipped: string[] = []
        let moved = 0

        for (const timer of timers) {
            // whatever is already live in the target was put there deliberately
            if (await Database.get(timer.kind, timer.name)) {
                skipped.push(timer.id)
                continue
            }

            await Database.set(timer)

            if (!(await Database.get(timer.kind, timer.name))) {
                throw new Error(`${timer.id} did not read back from "${to}", stopping before anything is lost`)
            }

            if (!keepSource) await source.delete(timer.kind, timer.name)
            moved++
        }

        if (skipped.length) {
            Logger.warn(`Left ${skipped.length} timer(s) in "${from}": their names are taken in "${to}" (${skipped.join(", ")})`)
        }

        const drained = !keepSource && !skipped.length
        Logger.info(`Migrated ${moved} timer(s) to "${to}"`)

        if (!drained) {
            Logger.warn(
                `"${from}" still holds timers, so this will run again on the next boot. ` +
                    "Remove `migrateFrom` from the options once you are done."
            )
        }

        return { moved, skipped, drained }
    } catch (err) {
        Logger.error("Migration stopped:", err)
        return null
    } finally {
        await source.destroy().catch(() => undefined)
    }
}