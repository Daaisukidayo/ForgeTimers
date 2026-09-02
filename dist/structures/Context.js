"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerContext = void 0;
const forgescript_1 = require("@tryforge/forgescript");
class TimerContext extends forgescript_1.Context {
    runtime;
    constructor(runtime) {
        super(runtime);
        this.runtime = runtime;
    }
    get user() {
        return super.user ?? this.runtime.host ?? null;
    }
    get member() {
        return super.member ?? this.runtime.hostMember ?? null;
    }
}
exports.TimerContext = TimerContext;
//# sourceMappingURL=Context.js.map