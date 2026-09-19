"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "timerDrop",
    version: "1.3.0",
    description: "Triggered when a stored timer is thrown away without running, with the reason in $timerDropReason",
    listener(environment) {
        (0, managers_1.runCommands)(this, "timerDrop", environment);
    },
});
//# sourceMappingURL=timerDrop.js.map