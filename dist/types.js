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
    /** A stored timer was picked back up after a restart, with `$timerOverdueBy` saying how late */
    TimerEvent["timerRestore"] = "timerRestore";
    /** A stored timer was thrown away without running, with `$timerDropReason` saying why */
    TimerEvent["timerDrop"] = "timerDrop";
    /**
     * Startup finished dealing with every stored timer, counted by `$timersRestored` and
     * `$timersDropped`. Does not fire at all if the storage could not be opened.
     */
    TimerEvent["timersReady"] = "timersReady";
    /** The timer storage opened, and timers will be kept across restarts */
    TimerEvent["databaseConnect"] = "databaseConnect";
    /** The storage could not be opened, with `$databaseFailReason` saying why. Nothing is persisted */
    TimerEvent["databaseFail"] = "databaseFail";
})(TimerEvent || (exports.TimerEvent = TimerEvent = {}));
//# sourceMappingURL=types.js.map