"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerEventHandler = exports.TimerCommandManager = exports.HANDLER = void 0;
exports.runCommands = runCommands;
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("..");
const logger_1 = require("../functions/logger");
exports.HANDLER = "ForgeTimersEvents";
class TimerCommandManager extends forgescript_1.BaseCommandManager {
    handlerName = exports.HANDLER;
}
exports.TimerCommandManager = TimerCommandManager;
class TimerEventHandler extends forgescript_1.BaseEventHandler {
    register(client) {
        client.getExtension(__1.ForgeTimers, true).emitter.on(this.name, this.listener.bind(client));
    }
}
exports.TimerEventHandler = TimerEventHandler;
function runCommands(client, event, environment) {
    const commands = client.getExtension(__1.ForgeTimers, true).commands?.get(event) ?? [];
    for (const command of commands) {
        forgescript_1.Interpreter.run({
            client,
            command,
            data: command.compiled.code,
            obj: {},
            environment,
        }).catch(logger_1.Logger.error);
    }
}
//# sourceMappingURL=EventsManager.js.map