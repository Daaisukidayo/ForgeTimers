"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
const types_1 = require("../types");
exports.default = new managers_1.TimerEventHandler({
    name: types_1.TimerEvent.timerDrop,
    description: "Triggered when a stored timer is thrown away without running, with the reason in $env[reason]",
    version: "1.3.0",
    listener(environment) {
        (0, managers_1.runCommands)(this, types_1.TimerEvent.timerDrop, environment);
    },
});
//# sourceMappingURL=timerDrop.js.map