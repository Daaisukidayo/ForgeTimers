"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timerRestore",
    version: "1.3.0",
    description: "Triggered when a stored timer is picked back up after a restart",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timerRestore", environment);
    },
});
//# sourceMappingURL=timerRestore.js.map