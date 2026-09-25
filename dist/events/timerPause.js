"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timerPause",
    version: "2.0.0",
    description: "Triggered when a timer is put on hold",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timerPause", environment);
    },
});
//# sourceMappingURL=timerPause.js.map