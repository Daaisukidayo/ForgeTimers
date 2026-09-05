"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateTimers = migrateTimers;
const Database_1 = require("../structures/Database");
const logger_1 = require("./logger");
/** What each backend needs loaded before its store can be opened */
const EXTENSION = {
    forgedb: "forge.db",
    quorieldb: "QuorielDB",
};
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
async function migrateTimers(client, from, to, keepSource = false) {
    if (from === to) {
        logger_1.Logger.warn(`Not migrating: "${from}" is already the storage in use.`);
        return null;
    }
    const wanted = EXTENSION[from];
    if (!client.options.extensions?.some((extension) => extension.name === wanted)) {
        logger_1.Logger.error(`Cannot migrate from "${from}": the ${wanted} extension is not loaded. ` +
            `Keep it in \`extensions\` for one boot, then remove it.`);
        return null;
    }
    let source;
    try {
        source = await Database_1.Database.open(from);
    }
    catch (err) {
        logger_1.Logger.error(`Cannot migrate from "${from}":`, err);
        return null;
    }
    try {
        const timers = await source.getAll();
        if (!timers.length)
            return { moved: 0, skipped: [], drained: true };
        logger_1.Logger.info(`Migrating ${timers.length} timer(s) from "${from}" to "${to}"`);
        const skipped = [];
        let moved = 0;
        for (const timer of timers) {
            // whatever is already live in the target was put there deliberately
            if (await Database_1.Database.get(timer.kind, timer.name)) {
                skipped.push(timer.id);
                continue;
            }
            await Database_1.Database.set(timer);
            if (!(await Database_1.Database.get(timer.kind, timer.name))) {
                throw new Error(`${timer.id} did not read back from "${to}", stopping before anything is lost`);
            }
            if (!keepSource)
                await source.delete(timer.kind, timer.name);
            moved++;
        }
        if (skipped.length) {
            logger_1.Logger.warn(`Left ${skipped.length} timer(s) in "${from}": their names are taken in "${to}" (${skipped.join(", ")})`);
        }
        const drained = !keepSource && !skipped.length;
        logger_1.Logger.info(`Migrated ${moved} timer(s) to "${to}"`);
        if (!drained) {
            logger_1.Logger.warn(`"${from}" still holds timers, so this will run again on the next boot. ` +
                "Remove `migrateFrom` from the options once you are done.");
        }
        return { moved, skipped, drained };
    }
    catch (err) {
        logger_1.Logger.error("Migration stopped:", err);
        return null;
    }
    finally {
        await source.destroy().catch(() => undefined);
    }
}
//# sourceMappingURL=migrate.js.map