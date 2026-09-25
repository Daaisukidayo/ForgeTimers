"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const managers_1 = require("../managers");
exports.default = new managers_1.TimerEventHandler({
    name: "databaseConnect",
    version: "2.0.0",
    description: "Triggered when the timer storage opens",
    listener(environment) {
        (0, managers_1.runCommands)(this, "databaseConnect", environment);
    },
});
//# sourceMappingURL=databaseConnect.js.map