"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitSafely = emitSafely;
const logger_1 = require("./logger");
/**
 * Emits without letting a throwing listener undo whatever reported the event.
 * @param emitter The extension's emitter.
 * @param event Event to emit.
 * @param payload What it carries.
 */
function emitSafely(emitter, event, payload) {
    try {
        emitter.emit(event, payload);
    }
    catch (err) {
        logger_1.Logger.error(err);
    }
}
//# sourceMappingURL=emit.js.map