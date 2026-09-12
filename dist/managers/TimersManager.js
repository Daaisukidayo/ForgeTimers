"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimersManager = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const discord_js_1 = require("discord.js");
const structures_1 = require("../structures");
const __1 = require("..");
const types_1 = require("../types");
const snapshotVars_1 = require("../functions/snapshotVars");
const schedule_1 = require("../functions/schedule");
const logger_1 = require("../functions/logger");
const timer_1 = require("../properties/timer");
const TARGET_GONE = "its target is gone";
function isGone(err) {
    return err instanceof discord_js_1.DiscordAPIError && err.status === 404;
}
function reasonOf(err) {
    return err instanceof Error ? err.message : String(err);
}
class TimersManager {
    client;
    timers;
    claims = 0;
    generations = new Map();
    constructor(client) {
        this.client = client;
        this.timers = client.getExtension(__1.ForgeTimers, true);
        client.once(discord_js_1.Events.ClientReady, async () => {
            if (!(await this.timers.ready))
                return;
            await this._restore();
        });
    }
    /**
     * Schedules a timer and persists it.
     * @param timer The timer to schedule.
     * @param run What it executes when it fires.
     */
    async start(timer, run) {
        const persisted = await this.timers.ready;
        if (this.clear(timer.kind, timer.name)) {
            logger_1.Logger.warn(`Replacing existing ${timer.kind} "${timer.name}"`);
        }
        if (persisted)
            await this._save(timer);
        // live timer already has its target, so it always runs
        this._arm(timer, async () => {
            await run();
            return { ran: true, gone: false };
        });
        this._report(types_1.TimerEvent.timerStart, timer);
        return timer;
    }
    /**
     * Cancels a running timer, leaving the database untouched.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
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
        this._release(kind, name);
        return true;
    }
    _save(timer) {
        return structures_1.Database.set(timer).catch(logger_1.Logger.error);
    }
    _forget(timer) {
        return structures_1.Database.delete(timer.kind, timer.name).catch(logger_1.Logger.error);
    }
    /** Reports how a one-shot ended, and spends its record only once the run is really over */
    async _settle(timer, outcome) {
        if (outcome.ran)
            this._report(types_1.TimerEvent.timerFire, timer);
        else if (outcome.gone)
            this._report(types_1.TimerEvent.timerDrop, timer, { reason: TARGET_GONE });
        // the record waits for the next boot because an outage is not a run
        if (outcome.ran || outcome.gone)
            await this._forget(timer);
    }
    _report(event, timer, extra) {
        const { emitter } = this.timers;
        if (!emitter.listenerCount(event))
            return;
        emitter.emit(event, { ...(0, timer_1.readProperties)(timer), ...extra });
    }
    async _reportCancel(kind, name, wasLive) {
        if (!this.timers.emitter.listenerCount(types_1.TimerEvent.timerCancel))
            return;
        const stored = (await this.timers.ready) ? await structures_1.Database.get(kind, name).catch(logger_1.Logger.error) : null;
        if (stored)
            return this._report(types_1.TimerEvent.timerCancel, stored);
        if (wasLive)
            this.timers.emitter.emit(types_1.TimerEvent.timerCancel, { id: structures_1.Timer.idOf(kind, name), kind, name });
    }
    /** Takes the name over and hands back a check for whether it's still ours */
    _claim(kind, name) {
        const key = structures_1.Timer.idOf(kind, name);
        const claim = ++this.claims;
        this.generations.set(key, claim);
        return () => this.generations.get(key) === claim;
    }
    /**
     * Forgets a name nothing is armed under any more. Whoever still holds its claim reads undefined
     * and stands down, the same as being superseded.
     */
    _release(kind, name) {
        this.generations.delete(structures_1.Timer.idOf(kind, name));
    }
    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether it was running, and whether a stored record was removed.
     */
    async stop(kind, name) {
        const cleared = this.clear(kind, name);
        await this._reportCancel(kind, name, cleared);
        if (!(await this.timers.ready))
            return [cleared, false];
        const result = await structures_1.Database.delete(kind, name).catch(logger_1.Logger.error);
        return [cleared, !!result && (result.affected ?? 0) > 0];
    }
    /**
     * Cancels every running timer and empties the table.
     * @returns The number of running timers that were cancelled.
     */
    async wipe() {
        let cleared = 0;
        for (const kind of [structures_1.TimerKind.timeout, structures_1.TimerKind.interval]) {
            for (const name of [...(this.mapOf(kind)?.keys() ?? [])]) {
                if (!this.clear(kind, name))
                    continue;
                cleared++;
                await this._reportCancel(kind, name, true);
            }
        }
        if (!(await this.timers.ready))
            return cleared;
        await structures_1.Database.wipe().catch(logger_1.Logger.error);
        return cleared;
    }
    /**
     * The live timer map ForgeScript keeps for a kind.
     * @param kind The kind of the timers.
     */
    mapOf(kind) {
        switch (kind) {
            case structures_1.TimerKind.timeout:
                return this.client.timeouts;
            case structures_1.TimerKind.interval:
                return this.client.intervals;
            default:
                // no map for this kind yet, so nothing to schedule
                return undefined;
        }
    }
    /**
     * Whether a timer under this name is already running.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
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
    /** Arms `fn`, keeping the live map on the pending chunk so {@link clear} cancels the right one */
    _schedule(kind, name, delay, fn) {
        const map = this.mapOf(kind);
        (0, schedule_1.setLongTimeout)(delay, fn, (handle) => map?.set(name, handle));
    }
    _arm(timer, run) {
        const owns = this._claim(timer.kind, timer.name);
        switch (timer.kind) {
            case structures_1.TimerKind.interval:
                return this._armInterval(timer, run, owns);
            case structures_1.TimerKind.timeout:
                return this._armTimeout(timer, run, owns);
            default:
                return this._assertNever(timer.kind, timer.name);
        }
    }
    _armTimeout(timer, run, owns) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            const outcome = await run();
            if (!owns())
                return;
            this.client.timeouts.delete(timer.name);
            this._release(timer.kind, timer.name);
            await this._settle(timer, outcome);
        });
    }
    _armInterval(timer, run, owns) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            if (!owns())
                return;
            await this._save(timer.advance());
            if (!owns()) {
                // cancelled while that write was in flight, so take the row back out
                if (!this.isLive(timer.kind, timer.name))
                    await this._forget(timer);
                return;
            }
            this._armInterval(timer, run, owns);
            const outcome = await run();
            if (outcome.ran)
                this._report(types_1.TimerEvent.timerFire, timer);
            if (outcome.gone && owns()) {
                logger_1.Logger.warn(`Stopping interval "${timer.name}": ${TARGET_GONE}`);
                this._report(types_1.TimerEvent.timerDrop, timer, { reason: TARGET_GONE });
                this.clear(timer.kind, timer.name);
                await this._forget(timer);
            }
        });
    }
    /**
     * Compiles now, fetches later. Boot stays free of requests, and a distant timer isn't
     * thrown away over an outage happening today.
     * @param timer The timer to build a runner for.
     */
    _runnerFor(timer) {
        let compiled;
        try {
            compiled = forgescript_1.Compiler.compile(timer.code, timer.path);
        }
        catch (err) {
            logger_1.Logger.untagged(err);
            // won't compile now, won't compile next boot either
            return { ok: false, gone: true, reason: "its code no longer compiles" };
        }
        const version = timer.version ?? 0;
        const keywords = (0, snapshotVars_1.restoreVars)(timer.vars?.keywords, version);
        const environment = (0, snapshotVars_1.restoreVars)(timer.vars?.environment, version);
        let resolved = null;
        let command = null;
        const run = async () => {
            if (!resolved) {
                const attempt = await this._resolve(timer);
                if (!attempt.ok) {
                    logger_1.Logger.warn(attempt.gone
                        ? `${timer.kind} "${timer.name}" has nowhere to run: ${attempt.reason}`
                        : `Could not run ${timer.kind} "${timer.name}" yet: ${attempt.reason}`);
                    return { ran: false, gone: attempt.gone };
                }
                resolved = attempt.resolved;
                // the file a timer came from cannot move under it, so this is looked up with the target
                command = this._commandFor(timer);
            }
            const ctx = new structures_1.TimerContext({
                client: this.client,
                command,
                data: compiled,
                obj: resolved.obj,
                doNotSend: true,
                redirectErrorsToConsole: true,
                keywords: { ...keywords },
                environment: { ...environment },
                localFunctions: (0, snapshotVars_1.rehydrateLocalFunctions)(timer.vars?.localFunctions, timer.path, "ForgeTimers"),
                args: timer.args ?? [],
                host: resolved.host,
                hostMember: resolved.hostMember,
            });
            await forgescript_1.Interpreter.run(ctx).catch(logger_1.Logger.error);
            return { ran: true, gone: false };
        };
        return { ok: true, run };
    }
    /**
     * Finds the live command again, so a restored run reads the same `$commandName`.
     * @param timer The timer to look up.
     */
    _commandFor(timer) {
        if (!timer.path && !timer.commandName)
            return null;
        const commands = this.client.commands?.toArray() ?? [];
        return (commands.find((command) => (timer.path && command.data.path === timer.path) ||
            (timer.commandName && command.data.name === timer.commandName)) ?? null);
    }
    /** Fetches everything a run needs from discord */
    async _resolve(timer) {
        const target = await this._rebuildTarget(timer);
        if (!target.ok)
            return target;
        const obj = target.obj;
        const hasAuthor = "author" in obj || "user" in obj;
        const host = timer.hostID && !hasAuthor ? await this.client.users.fetch(timer.hostID).catch(() => null) : null;
        const guild = timer.guildID ? this.client.guilds.cache.get(timer.guildID) : undefined;
        const hostMember = host && guild ? await guild.members.fetch(host.id).catch(() => null) : null;
        return { ok: true, resolved: { obj, host, hostMember } };
    }
    async _rebuildTarget(timer) {
        // no channel means empty target
        if (!timer.channelID)
            return { ok: true, obj: {} };
        let channel;
        try {
            channel = await this.client.channels.fetch(timer.channelID);
        }
        catch (err) {
            return {
                ok: false,
                gone: isGone(err),
                reason: `channel ${timer.channelID} could not be fetched: ${reasonOf(err)}`,
            };
        }
        if (!channel) {
            return { ok: false, gone: true, reason: `channel ${timer.channelID} no longer exists` };
        }
        // refills the author from hostID
        if (timer.messageID && "messages" in channel) {
            const message = await channel.messages.fetch(timer.messageID).catch(() => null);
            if (message)
                return { ok: true, obj: message };
        }
        return { ok: true, obj: channel };
    }
    /** What we can't see is left alone — it's a sibling shard or an outage. Deleting is opt-in */
    async _owns(timer) {
        if (!timer.guildID) {
            // no guild means shard 0, otherwise sharding would run it twice
            return !this.client.shard || this.client.shard.ids.includes(0);
        }
        if (this.client.guilds.cache.has(timer.guildID))
            return true;
        if (!this.client.shard && this.timers.options.pruneUnknownGuilds) {
            logger_1.Logger.warn(`Dropping ${timer.kind} "${timer.name}": guild ${timer.guildID} is not visible to this process`);
            this._report(types_1.TimerEvent.timerDrop, timer, {
                reason: `guild ${timer.guildID} is not visible to this process`,
            });
            await this._forget(timer);
        }
        return false;
    }
    async _restore() {
        if (!(await this.timers.ready))
            return;
        const timers = await structures_1.Database.getAll().catch(logger_1.Logger.error);
        if (!timers)
            return;
        const dueNow = [];
        for (const timer of timers) {
            if (this.isLive(timer.kind, timer.name)) {
                logger_1.Logger.warn(`Skipping ${timer.kind} "${timer.name}": already rescheduled since startup`);
                continue;
            }
            if (!(await this._owns(timer)))
                continue;
            const version = timer.version ?? 0;
            if (version > structures_1.Timer.SCHEMA_VERSION) {
                logger_1.Logger.warn(`Leaving ${timer.kind} "${timer.name}" alone: it was stored under schema ${version}, and this build only understands ${structures_1.Timer.SCHEMA_VERSION}`);
                continue;
            }
            const config = this.configOf(timer.kind);
            if (config.persist === false) {
                this._report(types_1.TimerEvent.timerDrop, timer, { reason: `persist is off for ${timer.kind}s` });
                await this._forget(timer);
                continue;
            }
            const runner = this._runnerFor(timer);
            if (!runner.ok) {
                if (runner.gone) {
                    logger_1.Logger.warn(`Dropping ${timer.kind} "${timer.name}": ${runner.reason}`);
                    this._report(types_1.TimerEvent.timerDrop, timer, { reason: runner.reason });
                    await this._forget(timer);
                }
                else {
                    logger_1.Logger.warn(`Keeping ${timer.kind} "${timer.name}" for the next boot: ${runner.reason}`);
                }
                continue;
            }
            const run = runner.run;
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
    /** Drops a one-shot that's too late, otherwise fires or re-arms it */
    async _restoreTimeout(timer, timing, run, dueNow) {
        if (timing.late) {
            logger_1.Logger.warn(`Discarding timeout "${timer.name}": overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms)`);
            this._report(types_1.TimerEvent.timerDrop, timer, {
                reason: `overdue by ${timing.overdueBy}ms, more than the ${timing.config.maxOverdue}ms allowed`,
                overdueBy: timing.overdueBy,
            });
            await this._forget(timer);
            return;
        }
        this._report(types_1.TimerEvent.timerRestore, timer, { overdueBy: timing.overdueBy });
        if (!timer.isOverdue())
            return this._arm(timer, run);
        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name))
                return;
            const owns = this._claim(timer.kind, timer.name);
            const outcome = await run();
            if (!owns())
                return;
            this._release(timer.kind, timer.name);
            await this._settle(timer, outcome);
        });
    }
    async _restoreInterval(timer, timing, run, dueNow) {
        this._report(types_1.TimerEvent.timerRestore, timer, { overdueBy: timing.overdueBy });
        if (timing.late) {
            logger_1.Logger.warn(`Interval "${timer.name}": skipping tick overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms), resuming schedule`);
            await this._save(timer.scheduleNext());
            return this._arm(timer, run);
        }
        if (!timer.isOverdue())
            return this._arm(timer, run);
        const missed = timer.missedTicks();
        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name))
                return;
            await this._replay(timer, missed, run);
            // a script may have rescheduled this name while the replay was running
            if (this.isLive(timer.kind, timer.name))
                return;
            await this._save(timer.scheduleNext());
            this._arm(timer, run);
        });
    }
    _assertNever(kind, name) {
        logger_1.Logger.warn(`Skipping timer "${name}": unsupported kind "${kind}"`);
    }
    /** Replays what was missed offline, up to `restoredTicksLimit` */
    async _replay(timer, missed, run) {
        const limit = this.timers.options.intervalConfig?.restoredTicksLimit;
        if (!limit)
            return;
        const toRun = limit < 0 ? missed : Math.min(missed, limit);
        if (toRun <= 0)
            return;
        logger_1.Logger.warn(missed > toRun
            ? `Interval "${timer.name}": replaying ${toRun} of ${missed} missed ticks.`
            : `Interval "${timer.name}": replaying ${toRun} missed tick(s).`);
        for (let i = 0; i < toRun; i++) {
            // no point replaying into a target we can't reach
            const outcome = await run();
            if (!outcome.ran)
                return;
            this._report(types_1.TimerEvent.timerFire, timer);
        }
    }
}
exports.TimersManager = TimersManager;
//# sourceMappingURL=TimersManager.js.map