"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoTimer = exports.Timer = exports.TimerKind = void 0;
const snapshotVars_1 = require("../functions/snapshotVars");
const cron_1 = require("../functions/cron");
var TimerKind;
(function (TimerKind) {
    TimerKind["timeout"] = "timeout";
    TimerKind["interval"] = "interval";
    TimerKind["cron"] = "cron";
})(TimerKind || (exports.TimerKind = TimerKind = {}));
class Timer {
    /**
     * What this build writes.
     */
    static SCHEMA_VERSION = snapshotVars_1.VARS_SCHEMA_VERSION;
    /**
     * Primary keys are `varchar(255)` on mysql, and a longer id is rejected.
     */
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
    /**
     * Variable schema this row was written under.
     * Null predates it and means v0.
     */
    version;
    /**
     * The delay of this timeout, or the tick length of this interval, in ms. Always 0 for a cron.
     */
    duration;
    /**
     * The cron expression this timer runs on, when it is one.
     */
    cron;
    /**
     * The zone that expression is read in, or null for whatever the process runs in.
     */
    timezone;
    /**
     * The timestamp this timer has been created at.
     */
    timestamp;
    /**
     * The timestamp this timer is next due to fire at.
     */
    fireAt;
    /**
     * The timestamp this timer was paused at, or null while it is running.
     */
    pausedAt;
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
     * The options this timer was scheduled with.
     */
    config;
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
        this.guildID = options?.guildID ?? null;
        this.channelID = options?.channelID ?? null;
        this.hostID = options?.hostID ?? null;
        this.messageID = options?.messageID ?? null;
        this.args = options?.args;
        this.config = options?.config ?? null;
        this.vars = options?.vars;
        this.timestamp = Date.now();
        this.pausedAt = null;
        // a cron owns no gap
        if (options?.kind === TimerKind.cron) {
            this.cron = options.cron;
            this.timezone = options.timezone ?? null;
            this.duration = 0;
            this.fireAt = (0, cron_1.nextRun)(this.cron, this.timestamp, this.timezone);
        }
        else {
            this.cron = null;
            this.timezone = null;
            this.duration = options?.duration ?? 0;
            this.fireAt = this.timestamp + this.duration;
        }
    }
    /**
     * A timer with nothing but its identity, for reporting one that is already gone.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    static stub(kind, name) {
        const now = Date.now();
        return Timer.from({
            id: Timer.idOf(kind, name),
            name,
            kind,
            code: "",
            duration: 0,
            version: Timer.SCHEMA_VERSION,
            timestamp: now,
            fireAt: now,
            pausedAt: null,
        });
    }
    /**
     * Whether this timer keeps to an expression rather than to a gap.
     */
    isCron() {
        return this.kind === TimerKind.cron && typeof this.cron === "string" && this.cron.length > 0;
    }
    /**
     * Whether this timer is on hold, and so neither running nor falling behind.
     */
    isPaused() {
        return typeof this.pausedAt === "number";
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
        // a paused timer stopped counting down the moment it was paused
        return Math.max(this.fireAt - (this.pausedAt ?? Date.now()), 0);
    }
    /**
     * Returns how long past due this timer is, or 0 if it isn't yet.
     */
    overdueBy() {
        if (this.isPaused())
            return 0;
        return Math.max(Date.now() - this.fireAt, 0);
    }
    /**
     * Returns whether this timer was due while the app was down.
     */
    isOverdue() {
        if (this.isPaused())
            return false;
        return this.fireAt <= Date.now();
    }
    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     */
    missedTicks(limit = Infinity) {
        if (this.isPaused())
            return 0;
        // an expression has no gap to divide by, only up to the limit
        if (this.isCron())
            return (0, cron_1.missedRuns)(this.cron, this.fireAt, limit, this.timezone);
        if (this.kind !== TimerKind.interval || this.duration <= 0)
            return 0;
        return Math.floor(this.overdueBy() / this.duration) + 1;
    }
    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     */
    scheduleNext() {
        this.fireAt = this.isCron() ? (0, cron_1.nextRun)(this.cron, Date.now(), this.timezone) : Date.now() + this.duration;
        return this;
    }
    /**
     * Steps whole ticks into the future, keeping the phase — a slow run shifts by ticks, not by itself.
     */
    advance() {
        // measured from the occurrence just run, so a slow one shifts by occurrences rather than by itself
        if (this.isCron()) {
            this.fireAt = (0, cron_1.nextRun)(this.cron, Math.max(this.fireAt, Date.now()), this.timezone);
            return this;
        }
        if (this.duration <= 0)
            return this.scheduleNext();
        const ticks = Math.max(1, Math.floor((Date.now() - this.fireAt) / this.duration) + 1);
        this.fireAt += ticks * this.duration;
        return this;
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