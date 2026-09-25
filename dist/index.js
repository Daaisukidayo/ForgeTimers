"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeTimers = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const node_events_1 = require("node:events");
const managers_1 = require("./managers");
const structures_1 = require("./structures");
const types_1 = require("./types");
const logger_1 = require("./functions/logger");
const emit_1 = require("./functions/emit");
const package_json_1 = require("../package.json");
const path_1 = __importDefault(require("path"));
class ForgeTimers extends forgescript_1.ForgeExtension {
    options;
    name = "ForgeTimers";
    description = package_json_1.description;
    version = package_json_1.version;
    timersManager;
    commands;
    emitter = new node_events_1.EventEmitter();
    ready;
    constructor(options = {}) {
        super();
        this.options = options;
        this.requireExtensions = [structures_1.Database.extensionOf(options.storage ?? "forgedb")];
    }
    /**
     * The extension on a client. Throws when it isn't loaded.
     * @param client Client to look on.
     */
    static of(client) {
        return client.getExtension(ForgeTimers, true);
    }
    /**
     * Config of a kind, `{}` when none was given.
     * @param kind Timer kind.
     */
    configOf(kind) {
        const { timeoutConfig, intervalConfig, cronConfig } = this.options;
        const configs = { timeout: timeoutConfig, interval: intervalConfig, cron: cronConfig };
        // a stored kind can be anything, toString too
        return (Object.hasOwn(configs, kind) && configs[kind]) || {};
    }
    init(client) {
        this._reviewOptions();
        this.load(path_1.default.resolve(__dirname, "native"));
        this.commands = new managers_1.TimerCommandManager(client);
        if (this.options.events?.length) {
            forgescript_1.EventManager.load(managers_1.HANDLER, path_1.default.resolve(__dirname, "events"));
            client.events.load(managers_1.HANDLER, this.options.events);
        }
        this.ready = this._open(client);
        client.crons = new Map();
        this.timersManager = new managers_1.TimersManager(client);
    }
    async _open(client) {
        const storage = this.options.storage ?? "forgedb";
        try {
            await structures_1.Database.use(storage);
        }
        catch (err) {
            logger_1.Logger.error(err);
            const reason = err instanceof Error ? err.message : String(err);
            (0, emit_1.emitSafely)(this.emitter, types_1.TimerEvent.databaseFail, { event: { failReason: reason } });
            return false;
        }
        (0, emit_1.emitSafely)(this.emitter, types_1.TimerEvent.databaseConnect, {});
        const { migrateFrom, keepSource } = this.options;
        if (!migrateFrom)
            return true;
        const needed = structures_1.Database.extensionOf(migrateFrom);
        if (client.options.extensions?.some((extension) => extension.name === needed)) {
            await structures_1.Database.migrate(migrateFrom, keepSource);
        }
        else {
            logger_1.Logger.error(`Cannot migrate from "${migrateFrom}": the ${needed} extension is not loaded. ` +
                "Keep it in `extensions` for one boot, then remove it.");
        }
        return true;
    }
    _reviewOptions() {
        const { storage, migrateFrom, events } = this.options;
        const backends = ["forgedb", "quorieldb"];
        for (const [option, value] of Object.entries({ storage, migrateFrom })) {
            if (value !== undefined && !backends.includes(value)) {
                logger_1.Logger.warn(`${option}: "${value}" is not a backend. ForgeDB is used instead. Pick one of: ${backends.join(", ")}.`);
            }
        }
        for (const kind of Object.values(structures_1.TimerKind)) {
            const config = this.configOf(kind);
            const max = config.maxOverdue;
            if (max !== undefined && max < 0) {
                logger_1.Logger.warn(`${kind}Config.maxOverdue is ${max}, which throws away every ${kind} that comes back late. Use 0, or leave it out, for no limit.`);
            }
            if (kind === structures_1.TimerKind.timeout)
                continue;
            const limit = config.restoredTicksLimit;
            if (limit !== undefined && limit < 0) {
                logger_1.Logger.warn(`${kind}Config.restoredTicksLimit is ${limit}, which replays nothing. Use Infinity to replay everything it missed.`);
            }
        }
        for (const event of events ?? []) {
            if (!Object.hasOwn(types_1.TimerEvent, event)) {
                logger_1.Logger.warn(`"${event}" is not a timer event.`);
            }
        }
    }
}
exports.ForgeTimers = ForgeTimers;
__exportStar(require("./managers"), exports);
__exportStar(require("./structures"), exports);
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map