"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var Timer_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MongoTimer = exports.Timer = exports.TimerKind = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const snapshotVars_1 = require("../functions/snapshotVars");
var TimerKind;
(function (TimerKind) {
    TimerKind["timeout"] = "timeout";
    TimerKind["interval"] = "interval";
})(TimerKind || (exports.TimerKind = TimerKind = {}));
/** Epoch ms overflows an int32 on mysql and postgres, so these columns are bigint */
const numericColumn = {
    to: (value) => value,
    from: (value) => value === null || value === undefined ? value : Number(value),
};
let Timer = class Timer {
    static { Timer_1 = this; }
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
        this.id = Timer_1.idOf(this.kind, this.name);
        this.code = options?.code ?? "";
        this.path = options?.path ?? null;
        this.commandName = options?.commandName ?? null;
        this.version = Timer_1.SCHEMA_VERSION;
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
     * Builds the primary key for a timer.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    static idOf(kind, name) {
        return `${kind}:${name}`;
    }
    /**
     * Longest usable name, since the id carries the kind too.
     * @param kind The kind of the timer.
     * @returns
     */
    static maxNameLength(kind) {
        return Timer_1.MAX_ID_LENGTH - Timer_1.idOf(kind, "").length;
    }
    /**
     * Returns the time left before this timer is due.
     * @returns
     */
    timeLeft() {
        return Math.max(this.fireAt - Date.now(), 0);
    }
    /**
     * Returns how long past due this timer is, or 0 if it isn't yet.
     * @returns
     */
    overdueBy() {
        return Math.max(Date.now() - this.fireAt, 0);
    }
    /**
     * Returns whether this timer was due while the app was down.
     * @returns
     */
    isOverdue() {
        return this.fireAt <= Date.now();
    }
    /**
     * Ticks elapsed since it was last due. Always 0 for timeouts, they fire once.
     * @returns
     */
    missedTicks() {
        if (this.kind !== TimerKind.interval || this.duration <= 0)
            return 0;
        return Math.floor(this.overdueBy() / this.duration) + 1;
    }
    /**
     * Pushes the due time a full duration out, dropping the phase. For an abandoned tick.
     * @returns
     */
    scheduleNext() {
        this.fireAt = Date.now() + this.duration;
        return this;
    }
    /**
     * Steps whole ticks into the future, keeping the phase — a slow run shifts by ticks, not by itself.
     * @returns
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
     * @returns
     */
    clone() {
        return Object.assign(Object.create(Object.getPrototypeOf(this)), this);
    }
};
exports.Timer = Timer;
__decorate([
    (0, typeorm_1.PrimaryColumn)(),
    __metadata("design:type", String)
], Timer.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Timer.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar" }),
    __metadata("design:type", String)
], Timer.prototype, "kind", void 0);
__decorate([
    (0, typeorm_1.Column)("text"),
    __metadata("design:type", String)
], Timer.prototype, "code", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "path", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "text", nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "commandName", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "int", nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "version", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "bigint", transformer: numericColumn }),
    __metadata("design:type", Number)
], Timer.prototype, "duration", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "bigint", transformer: numericColumn }),
    __metadata("design:type", Number)
], Timer.prototype, "timestamp", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "bigint", transformer: numericColumn }),
    __metadata("design:type", Number)
], Timer.prototype, "fireAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "guildID", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "channelID", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "hostID", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "messageID", void 0);
__decorate([
    (0, typeorm_1.Column)("simple-json", { nullable: true }),
    __metadata("design:type", Array)
], Timer.prototype, "args", void 0);
__decorate([
    (0, typeorm_1.Column)("simple-json", { nullable: true }),
    __metadata("design:type", Object)
], Timer.prototype, "vars", void 0);
exports.Timer = Timer = Timer_1 = __decorate([
    (0, typeorm_1.Entity)(),
    __metadata("design:paramtypes", [Object])
], Timer);
let MongoTimer = class MongoTimer extends Timer {
    /**
     * The object id for MongoDB.
     */
    mongoId;
};
exports.MongoTimer = MongoTimer;
__decorate([
    (0, typeorm_1.ObjectIdColumn)(),
    __metadata("design:type", String)
], MongoTimer.prototype, "mongoId", void 0);
exports.MongoTimer = MongoTimer = __decorate([
    (0, typeorm_1.Entity)()
], MongoTimer);
//# sourceMappingURL=Timer.js.map