"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timerResume",
    version: "2.0.0",
    description: "Triggered when a timer on hold is started again",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timerResume", environment);
    },
});
//# sourceMappingURL=timerResume.js.map