"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerEventProperty = void 0;
/**
 * What an event carries besides its timer.
 */
var TimerEventProperty;
(function (TimerEventProperty) {
    /** Why a timer was thrown away without running */
    TimerEventProperty["dropReason"] = "dropReason";
    /** Why the storage could not be opened */
    TimerEventProperty["failReason"] = "failReason";
    /** How late a timer was when startup reached it, in ms */
    TimerEventProperty["overdueBy"] = "overdueBy";
    /** How many stored timers startup picked back up */
    TimerEventProperty["restored"] = "restored";
    /** How many it threw away instead */
    TimerEventProperty["dropped"] = "dropped";
})(TimerEventProperty || (exports.TimerEventProperty = TimerEventProperty = {}));
//# sourceMappingURL=event.js.map