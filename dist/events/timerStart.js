"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timerStart",
    version: "1.3.0",
    description: "Triggered when a timer is scheduled",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timerStart", environment);
    },
});
//# sourceMappingURL=timerStart.js.map