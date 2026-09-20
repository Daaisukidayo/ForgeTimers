"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerEvent = void 0;
var TimerEvent;
(function (TimerEvent) {
    /** A timer was scheduled */
    TimerEvent["timerStart"] = "timerStart";
    /** A timer's code ran: a timeout going off, an interval ticking, or a cron coming round */
    TimerEvent["timerFire"] = "timerFire";
    /** A timer was cancelled by hand */
    TimerEvent["timerCancel"] = "timerCancel";
    /** A timer was put on hold, keeping its record and what was left of its wait */
    TimerEvent["timerPause"] = "timerPause";
    /** A timer on hold was started again, from where its wait was left */
    TimerEvent["timerResume"] = "timerResume";
    /** A stored timer was picked back up after a restart, with `$eventData[overdueBy]` saying how late */
    TimerEvent["timerRestore"] = "timerRestore";
    /** A stored timer was thrown away without running, with `$eventData[dropReason]` saying why */
    TimerEvent["timerDrop"] = "timerDrop";
    /**
     * Startup finished dealing with every stored timer, counted by `$eventData[restored]` and `$eventData[dropped]`.
     * Does not fire at all if the storage could not be opened.
     */
    TimerEvent["timersReady"] = "timersReady";
    /** The timer storage opened, and timers will be kept across restarts */
    TimerEvent["databaseConnect"] = "databaseConnect";
    /** The storage could not be opened, with `$eventData[failReason]` saying why. Nothing is persisted */
    TimerEvent["databaseFail"] = "databaseFail";
})(TimerEvent || (exports.TimerEvent = TimerEvent = {}));
//# sourceMappingURL=types.js.map