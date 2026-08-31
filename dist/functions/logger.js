"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const PREFIX = "ForgeTimers |";
class Logger extends forgescript_1.Logger {
    static debug(...args) {
        forgescript_1.Logger.debug(PREFIX, ...args);
    }
    static info(...args) {
        forgescript_1.Logger.info(PREFIX, ...args);
    }
    static warn(...args) {
        forgescript_1.Logger.warn(PREFIX, ...args);
    }
    static error(...args) {
        forgescript_1.Logger.error(PREFIX, ...args);
    }
    static deprecated(...args) {
        forgescript_1.Logger.deprecated(PREFIX, ...args);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map