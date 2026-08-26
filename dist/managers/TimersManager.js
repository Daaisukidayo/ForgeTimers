"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimersManager = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const structures_1 = require("../structures");
const __1 = require("..");
const snapshotVars_1 = require("../functions/snapshotVars");
const noop_1 = __importDefault(require("../functions/noop"));
class TimersManager {
    client;
    timers;
    constructor(client) {
        this.client = client;
        this.timers = client.getExtension(__1.ForgeTimers, true);
        client.once("clientReady", async () => {
            if (!(await this.timers.ready))
                return;
            await this._restore();
        });
    }
    /**
     * Schedules a timer and persists it.
     * @param options The timer to schedule.
     * @returns
     */
    async start(timer, run) {
        const persisted = await this.timers.ready;
        if (this.clear(timer.kind, timer.name)) {
            forgescript_1.Logger.warn(`[ForgeTimers] Replacing existing ${timer.kind} "${timer.name}"`);
        }
        if (persisted)
            await structures_1.Database.set(timer).catch(noop_1.default);
        this._arm(timer, run);
        return timer;
    }
    /**
     * Cancels a running timer, leaving the database untouched.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    clear(kind, name) {
        const map = this.mapOf(kind);
        const handle = map?.get(name);
        if (!map || !handle)
            return false;
        if (kind === structures_1.TimerKind.interval)
            clearInterval(handle);
        else
            clearTimeout(handle);
        map.delete(name);
        return true;
    }
    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    async stop(kind, name) {
        const persisted = await this.timers.ready;
        const cleared = this.clear(kind, name);
        if (persisted)
            await structures_1.Database.delete(kind, name).catch(noop_1.default);
        return cleared;
    }
    /**
     * Cancels every stored timer and empties the table.
     * @returns The number of running timers that were cancelled.
     */
    async wipe() {
        if (!(await this.timers.ready))
            return 0;
        const stored = await structures_1.Database.getAll().catch(noop_1.default);
        let cleared = 0;
        for (const timer of stored ?? []) {
            if (this.clear(timer.kind, timer.name))
                cleared++;
        }
        await structures_1.Database.wipe().catch(noop_1.default);
        return cleared;
    }
    /**
     * The live timer map ForgeScript keeps for a kind.
     * @param kind The kind of the timers.
     * @returns
     */
    mapOf(kind) {
        switch (kind) {
            case structures_1.TimerKind.timeout:
                return this.client.timeouts;
            case structures_1.TimerKind.interval:
                return this.client.intervals;
            default:
                // a kind with no map of its own isn't schedulable here yet
                return undefined;
        }
    }
    /**
     * Whether a timer under this name is already running.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    isLive(kind, name) {
        return !!this.mapOf(kind)?.has(name);
    }
    configOf(kind) {
        const { timeoutConfig, intervalConfig } = this.timers.options;
        switch (kind) {
            case structures_1.TimerKind.timeout:
                return timeoutConfig ?? {};
            case structures_1.TimerKind.interval:
                return intervalConfig ?? {};
            default:
                return {};
        }
    }
    _arm(timer, run) {
        switch (timer.kind) {
            case structures_1.TimerKind.interval: {
                const handle = setInterval(async () => {
                    await run();
                    await structures_1.Database.set(timer.scheduleNext()).catch(noop_1.default);
                }, timer.duration || undefined);
                this.client.intervals.set(timer.name, handle);
                return;
            }
            case structures_1.TimerKind.timeout:
                break;
            default:
                return this._assertNever(timer.kind, timer.name);
        }
        const handle = setTimeout(async () => {
            await run();
            this.client.timeouts.delete(timer.name);
            await structures_1.Database.delete(timer.kind, timer.name).catch(noop_1.default);
        }, timer.timeLeft() || undefined);
        this.client.timeouts.set(timer.name, handle);
    }
    /**
     * Rebuilds a runner for a stored timer, recompiling its code and
     * refetching the channel or message it was scheduled from.
     * @param timer The timer to build a runner for.
     * @returns
     */
    async _runnerFor(timer) {
        const obj = await this._rebuildTarget(timer);
        if (!obj)
            return null;
        let compiled;
        try {
            compiled = forgescript_1.Compiler.compile(timer.code, timer.path);
        }
        catch (err) {
            (0, noop_1.default)(err);
            return null;
        }
        const hasAuthor = "author" in obj || "user" in obj;
        const host = timer.hostID && !hasAuthor
            ? await this.client.users.fetch(timer.hostID).catch(() => null)
            : null;
        const guild = timer.guildID ? this.client.guilds.cache.get(timer.guildID) : undefined;
        const hostMember = host && guild ? await guild.members.fetch(host.id).catch(() => null) : null;
        return async () => {
            const ctx = new structures_1.TimerContext({
                client: this.client,
                command: null,
                data: compiled,
                obj,
                doNotSend: true,
                redirectErrorsToConsole: true,
                keywords: { ...timer.vars?.keywords },
                environment: { ...timer.vars?.environment },
                localFunctions: (0, snapshotVars_1.rehydrateLocalFunctions)(timer.vars?.localFunctions, timer.path, "ForgeTimers"),
                args: timer.args ?? [],
                host,
                hostMember,
            });
            await forgescript_1.Interpreter.run(ctx).catch(noop_1.default);
        };
    }
    async _rebuildTarget(timer) {
        const channel = await this.client.channels.fetch(timer.channelID).catch(() => null);
        if (!channel)
            return null;
        if (timer.messageID && "messages" in channel) {
            const message = await channel.messages.fetch(timer.messageID).catch(() => null);
            if (message)
                return message;
        }
        return channel;
    }
    /**
     * Whether this process should restore a given timer.
     */
    async _owns(timer) {
        if (timer.guildID) {
            if (this.client.guilds.cache.has(timer.guildID))
                return true;
            if (this.client.shard)
                return false;
            await structures_1.Database.delete(timer.kind, timer.name).catch(noop_1.default);
            return false;
        }
        // DM timer
        return !this.client.shard || this.client.shard.ids.includes(0);
    }
    async _restore() {
        if (!(await this.timers.ready))
            return;
        const timers = await structures_1.Database.getAll().catch(noop_1.default);
        if (!timers)
            return;
        const dueNow = [];
        for (const timer of timers) {
            if (this.isLive(timer.kind, timer.name)) {
                forgescript_1.Logger.warn(`[ForgeTimers] Skipping ${timer.kind} "${timer.name}": already rescheduled since startup`);
                continue;
            }
            if (!(await this._owns(timer)))
                continue;
            const config = this.configOf(timer.kind);
            if (config.persist === false) {
                await structures_1.Database.delete(timer.kind, timer.name).catch(noop_1.default);
                continue;
            }
            const run = await this._runnerFor(timer);
            if (!run) {
                await structures_1.Database.delete(timer.kind, timer.name).catch(noop_1.default);
                continue;
            }
            const overdueBy = timer.overdueBy();
            const late = !!(overdueBy && config.maxOverdue && overdueBy > config.maxOverdue);
            switch (timer.kind) {
                case structures_1.TimerKind.timeout:
                    await this._restoreTimeout(timer, { config, overdueBy, late }, run, dueNow);
                    break;
                case structures_1.TimerKind.interval:
                    await this._restoreInterval(timer, { config, overdueBy, late }, run, dueNow);
                    break;
                default:
                    this._assertNever(timer.kind, timer.name);
            }
        }
        await Promise.allSettled(dueNow.map((task) => task()));
    }
    /** Drops a one-shot timer that's too late, otherwise fires or re-arms it. */
    async _restoreTimeout(timer, timing, run, dueNow) {
        if (timing.late) {
            forgescript_1.Logger.warn(`[ForgeTimers] Discarding timeout "${timer.name}": overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms)`);
            await structures_1.Database.delete(timer.kind, timer.name).catch(noop_1.default);
            return;
        }
        if (!timer.isOverdue())
            return this._arm(timer, run);
        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name))
                return;
            await run();
            await structures_1.Database.delete(timer.kind, timer.name).catch(noop_1.default);
        });
    }
    async _restoreInterval(timer, timing, run, dueNow) {
        if (timing.late) {
            forgescript_1.Logger.warn(`[ForgeTimers] Interval "${timer.name}": skipping tick overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms), resuming schedule`);
            await structures_1.Database.set(timer.scheduleNext()).catch(noop_1.default);
            return this._arm(timer, run);
        }
        if (timer.isOverdue()) {
            const missed = timer.missedTicks();
            dueNow.push(async () => {
                if (this.isLive(timer.kind, timer.name))
                    return;
                await this._replay(timer, missed, run);
                await structures_1.Database.set(timer.scheduleNext()).catch(noop_1.default);
            });
        }
        this._arm(timer, run);
    }
    _assertNever(kind, name) {
        forgescript_1.Logger.warn(`[ForgeTimers] Skipping timer "${name}": unsupported kind "${kind}"`);
    }
    /**
     * Replays ticks that elapsed while the app was offline, honouring `restoredTicksLimit`.
     */
    async _replay(timer, missed, run) {
        const limit = this.timers.options.intervalConfig?.restoredTicksLimit;
        if (!limit)
            return;
        const toRun = limit < 0 ? missed : Math.min(missed, limit);
        if (toRun <= 0)
            return;
        forgescript_1.Logger.warn(missed > toRun
            ? `[ForgeTimers] Interval "${timer.name}": replaying ${toRun} of ${missed} missed ticks.`
            : `[ForgeTimers] Interval "${timer.name}": replaying ${toRun} missed tick(s).`);
        for (let i = 0; i < toRun; i++)
            await run();
    }
}
exports.TimersManager = TimersManager;
//# sourceMappingURL=TimersManager.js.map