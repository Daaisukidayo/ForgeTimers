"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
const types_1 = require("../types");
exports.default = new managers_1.TimerEventHandler({
    name: types_1.TimerEvent.timerCancel,
    description: "Triggered when a timer is cancelled by hand",
    version: "1.3.0",
    listener(environment) {
        (0, managers_1.runCommands)(this, types_1.TimerEvent.timerCancel, environment);
    },
});
//# sourceMappingURL=timerCancel.js.map