"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Database = void 0;
const logger_1 = require("../functions/logger");
class Database {
    static store;
    /** Backend of `store`, the one a migration moves into. */
    static storage;
    /**
     * Opens a backend without putting it in charge. A migration reads its source this way.
     * @param storage Backend to open.
     */
    static async open(storage = "forgedb") {
        const store = load(storage);
        await store.init();
        return store;
    }
    /**
     * Opens a backend and puts it in charge. Closes whatever was open before.
     * @param storage Backend to keep timers in.
     */
    static async use(storage = "forgedb") {
        await this.store?.destroy().catch(() => undefined);
        this.store = undefined;
        this.storage = undefined;
        this.store = await this.open(storage);
        this.storage = backendOf(storage);
        return this.store;
    }
    /**
     * Extension a backend needs in `extensions`.
     * @param storage Backend to look up.
     */
    static extensionOf(storage) {
        return EXTENSION[backendOf(storage)];
    }
    /**
     * Moves every timer from another backend into the one in use. Each is read back before its original goes.
     * The source's extension has to be loaded, check before calling.
     * Calls the facade `get` and `set`, not `current`. A test patches `get` to lose a write.
     * @param from Backend to move out of.
     * @param keepSource Copy instead of move. The next boot migrates again until `migrateFrom` goes.
     * @returns What moved, or null when it could not run or stopped halfway.
     */
    static async migrate(from, keepSource = false) {
        const to = this.storage;
        if (!to)
            throw new Error("Open a storage with Database.use before migrating into it.");
        if (backendOf(from) === to) {
            logger_1.Logger.warn(`Not migrating: "${from}" is already the storage in use.`);
            return null;
        }
        let source;
        try {
            source = await this.open(from);
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
                // already in the target means someone put it there on purpose
                if (await this.get(timer.kind, timer.name)) {
                    skipped.push(timer.id);
                    continue;
                }
                await this.set(timer);
                if (!(await this.get(timer.kind, timer.name))) {
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
    /** Store in use. Throws until `use` opened one. */
    static get current() {
        if (!this.store)
            throw new Error("The timer database has not been opened yet.");
        return this.store;
    }
    /**
     * Closes the store in use.
     */
    static async destroy() {
        await this.store?.destroy();
        this.store = undefined;
        this.storage = undefined;
    }
    /**
     * Stored timer, null if there is none.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    static async get(kind, name) {
        return await this.current.get(kind, name);
    }
    /**
     * Every stored timer.
     */
    static async getAll() {
        return await this.current.getAll();
    }
    /**
     * Stored timers of one kind.
     * @param kind Timer kind.
     */
    static async getAllOf(kind) {
        return await this.current.getAllOf(kind);
    }
    /**
     * Writes a timer over whatever has its id.
     * @param timer Timer to write.
     */
    static async set(timer) {
        await this.current.set(timer);
    }
    /**
     * Deletes a stored timer.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    static async delete(kind, name) {
        return await this.current.delete(kind, name);
    }
    /**
     * Deletes every stored timer.
     */
    static async wipe() {
        await this.current.wipe();
    }
}
exports.Database = Database;
/** Extension each backend needs loaded */
const EXTENSION = {
    forgedb: "forge.db",
    quorieldb: "QuorielDB",
};
/** Package each backend needs, named when its require fails */
const INSTALL = {
    forgedb: "@tryforge/forge.db",
    quorieldb: "@quoriel/db",
};
/**
 * Backend a name really opens. Anything unknown falls back to ForgeDB.
 * @param storage Backend asked for.
 */
function backendOf(storage) {
    return storage === "quorieldb" ? "quorieldb" : "forgedb";
}
/**
 * Module the require actually tripped over.
 * @param err Whatever the require threw.
 * @returns Its name, null when the require failed for another reason.
 */
function missingModule(err) {
    if (!(err instanceof Error) || err.code !== "MODULE_NOT_FOUND")
        return null;
    return /Cannot find module '([^']+)'/.exec(err.message)?.[1] ?? null;
}
/**
 * Required only on the way in. A backend's packages load just for whoever picked it.
 * @param storage Backend to load.
 */
function load(storage) {
    try {
        if (backendOf(storage) === "quorieldb") {
            const { QuorielDBStore } = require("./stores/QuorielDBStore");
            return new QuorielDBStore();
        }
        const { ForgeDBStore } = require("./stores/ForgeDBStore");
        return new ForgeDBStore();
    }
    catch (err) {
        const wanted = missingModule(err) ?? INSTALL[backendOf(storage)];
        throw new Error(`storage: "${storage}" could not be opened. If ${wanted} is not installed, ` +
            `run \`npm i ${wanted}\`.\nThe loader said: ` +
            (err instanceof Error ? err.message : String(err)), { cause: err });
    }
}
//# sourceMappingURL=Database.js.map