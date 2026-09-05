"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoTimer = exports.Timer = exports.TimerKind = void 0;
const snapshotVars_1 = require("../functions/snapshotVars");
var TimerKind;
(function (TimerKind) {
    TimerKind["timeout"] = "timeout";
    TimerKind["interval"] = "interval";
})(TimerKind || (exports.TimerKind = TimerKind = {}));
class Timer {
    /** What this build writes */
    static SCHEMA_VERSION = snapshotVars_1.VARS_SCHEMA_VERSION;
    /** Primary keys are `varchar(255)` on mysql, and a longer id is rejected, not truncated */
    static MAX_ID_LENGTH = 255;
    /**
     * The id of this timer, in the form `kind:name`.
     */
    id;
    /**
     * The name this timer was scheduled under.
     */
    name;
    /**
     * The kind of the timer.
     */
    kind;
    /**
     * The ForgeScript code this timer executes.
     */
    code;
    /**
     * The path of the command this timer was scheduled from.
     */
    path;
    /**
     * The name of the command this timer was scheduled from.
     */
    commandName;
    /** Variable schema this row was written under. Null predates it and means v0 */
    version;
    /**
     * The delay of this timeout, or the tick length of this interval, in ms.
     */
    duration;
    /**
     * The timestamp this timer has been created at.
     */
    timestamp;
    /**
     * The timestamp this timer is next due to fire at.
     */
    fireAt;
    /**
     * The id of the guild this timer has been created on.
     */
    guildID;
    /**
     * The id of the channel this timer has been created in, if any.
     */
    channelID;
    /**
     * The id of the user that scheduled this timer.
     */
    hostID;
    /**
     * The id of the message this timer was scheduled from.
     */
    messageID;
    /**
     * The command arguments this timer was scheduled with.
     */
    args;
    /**
     * The serializable variables present when this timer was scheduled.
     */
    vars;
    constructor(options) {
        this.name = options?.name ?? "";
        this.kind = options?.kind ?? TimerKind.timeout;
        this.id = Timer.idOf(this.kind, this.name);
        this.code = options?.code ?? "";
        this.path = options?.path ?? null;
        this.commandName = options?.commandName ?? null;
        this.version = Timer.SCHEMA_VERSION;
        this.duration = options?.duration ?? 0;
        this.guildID = options?.guildID ?? null;
        this.channelID = options?.channelID ?? null;
        this.hostID = options?.hostID ?? null;
        this.messageID = options?.messageID ?? null;
        this.args = options?.args;
        this.vars = options?.vars;
        this.timestamp = Date.now();
        this.fireAt = this.timestamp + this.duration;
    }
    /**
     * Rebuilds a timer from a stored row, for a backend that hands back plain data.
     * @param data The row to rebuild from.
     */
    static from(data) {
        return Object.assign(Object.create(Timer.prototype), data);
    }
    /**
     * Builds the primary key for a timer.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    static idOf(kind, name) {
        return `${kind}:${name}`;
    }
    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind The kind of the timer.
     */
    static maxNameLength(kind) {
        return Timer.MAX_ID_LENGTH - Timer.idOf(kind, "").length;
    }
    /**
     * Returns the time left before this timer is due.
     */
    timeLeft() {
        return Math.max(this.fireAt - Date.now(), 0);
    }
    /**
     * Returns how long past due this timer is, or 0 if it isn't yet.
     */
    overdueBy() {
        return Math.max(Date.now() - this.fireAt, 0);
    }
    /**
     * Returns whether this timer was due while the app was down.
     */
    isOverdue() {
        return this.fireAt <= Date.now();
    }
    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     */
    missedTicks() {
        if (this.kind !== TimerKind.interval || this.duration <= 0)
            return 0;
        return Math.floor(this.overdueBy() / this.duration) + 1;
    }
    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     */
    scheduleNext() {
        this.fireAt = Date.now() + this.duration;
        return this;
    }
    /**
     * Steps whole ticks into the future, keeping the phase — a slow run shifts by ticks, not by itself.
     */
    advance() {
        if (this.duration <= 0)
            return this.scheduleNext();
        const ticks = Math.max(1, Math.floor((Date.now() - this.fireAt) / this.duration) + 1);
        this.fireAt += ticks * this.duration;
        return this;
    }
    /**
     * Clones this timer.
     */
    clone() {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }
}
exports.Timer = Timer;
class MongoTimer extends Timer {
    /**
     * The object id for MongoDB.
     */
    mongoId;
}
exports.MongoTimer = MongoTimer;
//# sourceMappingURL=Timer.js.map