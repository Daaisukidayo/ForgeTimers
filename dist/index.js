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
const logger_1 = require("./functions/logger");
const package_json_1 = require("../package.json");
const path_1 = __importDefault(require("path"));
class ForgeTimers extends forgescript_1.ForgeExtension {
    options;
    name = "ForgeTimers";
    description = package_json_1.description;
    version = package_json_1.version;
    requireExtensions = ["forge.db"];
    timersManager;
    ready;
    constructor(options = {}) {
        super();
        this.options = options;
    }
    init(client) {
        this.load(path_1.default.resolve(__dirname, "native"));
        this.ready = new structures_1.Database()
            .init()
            .then(() => true)
            .catch((err) => {
            logger_1.Logger.error(err);
            return false;
        });
        this.timersManager = new managers_1.TimersManager(client);
    }
}
exports.ForgeTimers = ForgeTimers;
__exportStar(require("./managers"), exports);
__exportStar(require("./structures"), exports);
__exportStar(require("./types"), exports);
__exportStar(require("./functions/snapshotVars"), exports);
//# sourceMappingURL=index.js.map