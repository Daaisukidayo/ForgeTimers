"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timerCancel",
    version: "1.3.0",
    description: "Triggered when a timer is cancelled by hand",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timerCancel", environment);
    },
});
//# sourceMappingURL=timerCancel.js.map