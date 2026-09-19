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
const migrate_1 = require("./functions/migrate");
const types_1 = require("./types");
const logger_1 = require("./functions/logger");
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
        this.requireExtensions = [options.storage === "quorieldb" ? "QuorielDB" : "forge.db"];
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
            this.emitter.emit(types_1.TimerEvent.databaseFail, { event: { failReason: reason } });
            return false;
        }
        this.emitter.emit(types_1.TimerEvent.databaseConnect, {});
        const { migrateFrom, keepSource } = this.options;
        if (migrateFrom)
            await (0, migrate_1.migrateTimers)(client, migrateFrom, storage, keepSource);
        return true;
    }
    _reviewOptions() {
        const { storage, migrateFrom, timeoutConfig, intervalConfig, cronConfig, events } = this.options;
        const backends = ["forgedb", "quorieldb"];
        for (const [option, value] of Object.entries({ storage, migrateFrom })) {
            if (value !== undefined && !backends.includes(value)) {
                logger_1.Logger.warn(`${option}: "${value}" is not a backend. ForgeDB is used instead. Pick one of: ${backends.join(", ")}.`);
            }
        }
        const configs = {
            [structures_1.TimerKind.timeout]: timeoutConfig,
            [structures_1.TimerKind.interval]: intervalConfig,
            [structures_1.TimerKind.cron]: cronConfig,
        };
        for (const kind of Object.values(structures_1.TimerKind)) {
            const config = configs[kind];
            const max = config?.maxOverdue;
            if (max !== undefined && max < 0) {
                logger_1.Logger.warn(`${kind}Config.maxOverdue is ${max}, which throws away every ${kind} that comes back late. Use 0, or leave it out, for no limit.`);
            }
            if (kind === structures_1.TimerKind.timeout)
                continue;
            const limit = config?.restoredTicksLimit;
            if (limit !== undefined && limit < 0) {
                logger_1.Logger.warn(`${kind}Config.restoredTicksLimit is ${limit}, which replays nothing. Use Infinity to replay everything it missed.`);
            }
        }
        for (const event of events ?? []) {
            if (!(event in types_1.TimerEvent)) {
                logger_1.Logger.warn(`"${event}" is not a timer event, so loading them will fail. ` +
                    `The ones there are: ${Object.keys(types_1.TimerEvent).join(", ")}.`);
            }
        }
    }
}
exports.ForgeTimers = ForgeTimers;
__exportStar(require("./managers"), exports);
__exportStar(require("./structures"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./functions/snapshotVars"), exports);
__exportStar(require("./functions/migrate"), exports);
//# sourceMappingURL=index.js.map