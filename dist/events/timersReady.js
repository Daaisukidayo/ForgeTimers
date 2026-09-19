"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timersReady",
    version: "2.0.0",
    description: "Triggered once startup has dealt with every stored timer",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timersReady", environment);
    },
});
//# sourceMappingURL=timersReady.js.map