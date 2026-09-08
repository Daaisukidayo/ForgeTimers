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
const managers_1 = require("./managers");
const structures_1 = require("./structures");
const migrate_1 = require("./functions/migrate");
const logger_1 = require("./functions/logger");
const package_json_1 = require("../package.json");
const path_1 = __importDefault(require("path"));
class ForgeTimers extends forgescript_1.ForgeExtension {
    options;
    name = "ForgeTimers";
    description = package_json_1.description;
    version = package_json_1.version;
    timersManager;
    ready;
    constructor(options = {}) {
        super();
        this.options = options;
        this.requireExtensions = [options.storage === "quorieldb" ? "QuorielDB" : "forge.db"];
    }
    init(client) {
        this.load(path_1.default.resolve(__dirname, "native"));
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
            return false;
        }
        const { migrateFrom, keepSource } = this.options;
        if (migrateFrom)
            await (0, migrate_1.migrateTimers)(client, migrateFrom, storage, keepSource);
        return true;
    }
}
exports.ForgeTimers = ForgeTimers;
__exportStar(require("./managers"), exports);
__exportStar(require("./structures"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./functions/snapshotVars"), exports);
__exportStar(require("./functions/migrate"), exports);
//# sourceMappingURL=index.js.map