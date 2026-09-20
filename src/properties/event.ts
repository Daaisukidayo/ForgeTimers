/**
 * What an event carries besides its timer.
 */
export enum TimerEventProperty {
    /** Why a timer was thrown away without running */
    dropReason = "dropReason",

    /** Why the storage could not be opened */
    failReason = "failReason",

    /** How late a timer was when startup reached it, in ms */
    overdueBy = "overdueBy",

    /** How many stored timers startup picked back up */
    restored = "restored",

    /** How many it threw away instead */
    dropped = "dropped",
}
