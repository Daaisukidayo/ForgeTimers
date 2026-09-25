"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoTimer = exports.Timer = exports.TimerKind = void 0;
const PersistedVars_1 = require("./PersistedVars");
const cron_1 = require("../functions/cron");
var TimerKind;
(function (TimerKind) {
    TimerKind["timeout"] = "timeout";
    TimerKind["interval"] = "interval";
    TimerKind["cron"] = "cron";
})(TimerKind || (exports.TimerKind = TimerKind = {}));
class Timer {
    /**
     * Variable schema this build writes.
     */
    static SCHEMA_VERSION = PersistedVars_1.VARS_SCHEMA_VERSION;
    /**
     * Primary keys are `varchar(255)` on mysql, and a longer id is rejected.
     */
    static MAX_ID_LENGTH = 255;
    /**
     * Primary key, `kind:name`.
     */
    id;
    /**
     * Name it was scheduled under.
     */
    name;
    /**
     * Timeout, interval or cron.
     */
    kind;
    /**
     * ForgeScript code it runs.
     */
    code;
    /**
     * Path of the command it was scheduled from.
     */
    path;
    /**
     * Name of the command it was scheduled from.
     */
    commandName;
    /**
     * Variable schema this row was written under.
     * Null predates it and means v0.
     */
    version;
    /**
     * Delay of a timeout or tick length of an interval, in ms. Always 0 for a cron.
     */
    duration;
    /**
     * Cron expression, when it is a cron.
     */
    cron;
    /**
     * Zone the expression is read in, null for the process zone.
     */
    timezone;
    /**
     * When it was scheduled, unix ms.
     */
    timestamp;
    /**
     * When it is next due, unix ms.
     */
    fireAt;
    /**
     * When it was paused, null while running.
     */
    pausedAt;
    /**
     * Guild it was scheduled in.
     */
    guildID;
    /**
     * Channel it was scheduled in, if any.
     */
    channelID;
    /**
     * User who scheduled it.
     */
    authorID;
    /**
     * Message it was scheduled from.
     */
    messageID;
    /**
     * Command arguments at scheduling time.
     */
    args;
    /**
     * Options the call spelled out.
     */
    config;
    /**
     * Variables at scheduling time, the serializable ones.
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
        this.authorID = options?.authorID ?? null;
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
     * @param kind Timer kind.
     * @param name Timer name.
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
     * Whether it keeps to an expression rather than a gap.
     */
    isCron() {
        return this.kind === TimerKind.cron && typeof this.cron === "string" && this.cron.length > 0;
    }
    /**
     * Whether it is on hold, neither running nor falling behind.
     */
    isPaused() {
        return typeof this.pausedAt === "number";
    }
    /**
     * Rebuilds a timer from a stored row, for a backend that hands back plain data. Folds a pre-2.0.0 `hostID` into `authorID`.
     * @param data Row to rebuild.
     */
    static from(data) {
        const timer = Object.assign(Object.create(Timer.prototype), data);
        if (timer.authorID === undefined)
            timer.authorID = timer.hostID ?? null;
        delete timer.hostID;
        return timer;
    }
    /**
     * Builds the primary key for a timer.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    static idOf(kind, name) {
        return `${kind}:${name}`;
    }
    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind Timer kind.
     */
    static maxNameLength(kind) {
        return Timer.MAX_ID_LENGTH - Timer.idOf(kind, "").length;
    }
    /**
     * Time left before it is due.
     */
    timeLeft() {
        // a paused timer stopped counting down the moment it was paused
        return Math.max(this.fireAt - (this.pausedAt ?? Date.now()), 0);
    }
    /**
     * How long past due it is, 0 when not yet.
     */
    overdueBy() {
        if (this.isPaused())
            return 0;
        return Math.max(Date.now() - this.fireAt, 0);
    }
    /**
     * Whether it came due while the app was down.
     */
    isOverdue() {
        if (this.isPaused())
            return false;
        return this.fireAt <= Date.now();
    }
    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     * @param limit Most worth counting. A cron counts them one by one.
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
     * Steps whole ticks into the future, keeping the phase. A slow run shifts by ticks, not by itself.
     */
    advance() {
        // measured from the occurrence just run, a slow one shifts by whole occurrences
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
    /**
     * What builds before 2.0.0 wrote the author under, read beside {@link Timer.authorID} on mongo alone.
     */
    hostID;
}
exports.MongoTimer = MongoTimer;
//# sourceMappingURL=Timer.js.map