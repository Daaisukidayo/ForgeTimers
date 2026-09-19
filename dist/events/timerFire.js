"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timerFire",
    version: "1.3.0",
    description: "Triggered when a timer's code runs: a timeout going off, or an interval ticking",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timerFire", environment);
    },
});
//# sourceMappingURL=timerFire.js.map