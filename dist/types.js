"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerEvent = void 0;
var TimerEvent;
(function (TimerEvent) {
    /** A timer was scheduled */
    TimerEvent["timerStart"] = "timerStart";
    /** A timer's code ran: a timeout going off, or an interval ticking */
    TimerEvent["timerFire"] = "timerFire";
    /** A timer was cancelled by hand */
    TimerEvent["timerCancel"] = "timerCancel";
    /** A stored timer was picked back up after a restart */
    TimerEvent["timerRestore"] = "timerRestore";
    /** A stored timer was thrown away without running, with `$env[reason]` saying why */
    TimerEvent["timerDrop"] = "timerDrop";
})(TimerEvent || (exports.TimerEvent = TimerEvent = {}));
//# sourceMappingURL=types.js.map