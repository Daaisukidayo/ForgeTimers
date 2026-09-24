"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimersManager = void 0;
const forgescript_1 = require("@tryforge/forgescript");
const discord_js_1 = require("discord.js");
const structures_1 = require("../structures");
const __1 = require("..");
const types_1 = require("../types");
const overrides_1 = require("../functions/overrides");
const cron_1 = require("../functions/cron");
const schedule_1 = require("../functions/schedule");
const emit_1 = require("../functions/emit");
const logger_1 = require("../functions/logger");
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
    /** Last queued write per timer. Only `_queue` writes here. */
    writes = new Map();
    /** Timeouts mid-run. */
    firing = new Set();
    /**
     * Restores stored timers once the client is ready and storage is open.
     * @param client Client the timers run on.
     */
    constructor(client) {
        this.client = client;
        this.timers = __1.ForgeTimers.of(client);
        client.once(discord_js_1.Events.ClientReady, async () => {
            if (!(await this.timers.ready))
                return;
            await this._restore();
        });
    }
    /**
     * Arms and stores a new timer. Anything under the same name gets replaced.
     * @param timer Timer to start.
     * @param run Its code, already bound to the calling context.
     */
    async start(timer, run) {
        const persisted = await this.timers.ready;
        if (this.clear(timer.kind, timer.name)) {
            logger_1.Logger.warn(`Replacing existing ${timer.kind} "${timer.name}"`);
        }
        if (persisted)
            await this._save(timer);
        // a live run has its target already, no outage to hit
        this._arm(timer, async () => {
            await run();
            return { ran: true };
        });
        this._report(types_1.TimerEvent.timerStart, timer);
        return timer;
    }
    /**
     * Disarms only, the row stays. Use `stop` to forget it too.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns True if something was armed or mid-run.
     */
    clear(kind, name) {
        const map = this.mapOf(kind);
        const handle = map?.get(name);
        if (map && handle) {
            // ours all come from setLongTimeout, and clearTimeout stops a core setInterval handle too
            clearTimeout(handle);
            map.delete(name);
        }
        // a restored run can hold the name with nothing in the map
        const held = this.generations.has(structures_1.Timer.idOf(kind, name));
        this._release(kind, name);
        return !!handle || held;
    }
    /**
     * Every write for one timer goes through here, in call order.
     * Skip it and a tick landing late can undo a pause.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param write Runs once earlier writes have landed.
     */
    _queue(kind, name, write) {
        const key = structures_1.Timer.idOf(kind, name);
        const next = (this.writes.get(key) ?? Promise.resolve()).then(write);
        const settled = next.then(() => undefined, () => undefined);
        this.writes.set(key, settled);
        void settled.then(() => {
            if (this.writes.get(key) === settled)
                this.writes.delete(key);
        });
        return next;
    }
    /**
     * Pending writes for this timer. Await before reading the row.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    _settled(kind, name) {
        return this.writes.get(structures_1.Timer.idOf(kind, name)) ?? Promise.resolve();
    }
    /**
     * Read, change and write in one queue turn.
     * Inside `change` write through Database directly, `_save` would wait on itself.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param change Gets the stored timer, or null.
     * @returns Whatever `change` said, false with no backend.
     */
    async _locked(kind, name, change) {
        if (!(await this.timers.ready))
            return false;
        return this._queue(kind, name, async () => change((await structures_1.Database.get(kind, name).catch(logger_1.Logger.error)) || null));
    }
    /**
     * Queued write of the timer as it is now.
     * @param timer Timer to write.
     */
    _save(timer) {
        return this._queue(timer.kind, timer.name, () => structures_1.Database.set(timer)).catch(logger_1.Logger.error);
    }
    /**
     * Tick write. Dropped if the name changed hands before its turn, the new owner already wrote.
     * @param timer Timer to write.
     * @param owns Checked when the turn comes, not now.
     */
    _saveHeld(timer, owns) {
        return this._queue(timer.kind, timer.name, async () => {
            if (owns())
                await structures_1.Database.set(timer);
        }).catch(logger_1.Logger.error);
    }
    /**
     * Queued delete of the row.
     * @param timer Timer to forget.
     */
    _forget(timer) {
        return this._queue(timer.kind, timer.name, () => structures_1.Database.delete(timer.kind, timer.name)).catch(logger_1.Logger.error);
    }
    /**
     * Runs a timeout and spends it. Pause and reschedule refuse it until done, or it runs twice.
     * @param timer Timeout that fires.
     * @param run What it runs.
     * @param owns Whether the name is still ours.
     */
    async _fire(timer, run, owns) {
        this.firing.add(timer.id);
        try {
            const outcome = await run();
            if (!owns())
                return;
            this.client.timeouts.delete(timer.name);
            this._release(timer.kind, timer.name);
            await this._settle(timer, outcome);
        }
        finally {
            this.firing.delete(timer.id);
        }
    }
    /**
     * Reports the fire and drops the row. On an outage (`ran` false) the row stays for the next boot.
     * @param timer Timeout that ran.
     * @param outcome How the run went.
     */
    async _settle(timer, outcome) {
        if (!outcome.ran)
            return;
        this._report(types_1.TimerEvent.timerFire, timer);
        await this._forget(timer);
    }
    /**
     * Emits only with listeners. A throwing listener gets logged, never rethrown.
     * @param name Event to emit.
     * @param timer For `$timerData` and `$newTimer`.
     * @param event Extras for `$eventData`.
     * @param previous For `$oldTimer`.
     */
    _report(name, timer, event, previous) {
        const { emitter } = this.timers;
        if (!emitter.listenerCount(name))
            return;
        (0, emit_1.emitSafely)(emitter, name, { timer, event, previous });
    }
    /**
     * Copy for events. The original keeps changing after the report.
     * @param timer Timer to copy.
     */
    _snapshot(timer) {
        return structures_1.Timer.from({ ...timer });
    }
    /**
     * timerCancel with the stored row, or a stub when only an armed timer existed.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param wasLive Report a stub even without a row.
     */
    async _reportCancel(kind, name, wasLive) {
        if (!this.timers.emitter.listenerCount(types_1.TimerEvent.timerCancel))
            return;
        const stored = (await this.timers.ready) ? await structures_1.Database.get(kind, name).catch(logger_1.Logger.error) : null;
        if (stored)
            return this._report(types_1.TimerEvent.timerCancel, stored);
        if (wasLive)
            (0, emit_1.emitSafely)(this.timers.emitter, types_1.TimerEvent.timerCancel, { timer: structures_1.Timer.stub(kind, name) });
    }
    /**
     * Holds the name for a restored run with nothing armed yet.
     * Always releases, else the name reads live forever.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param task Gets a check for whether the name is still held.
     */
    async _claimed(kind, name, task) {
        const owns = this._claim(kind, name);
        try {
            await task(owns);
        }
        catch (err) {
            logger_1.Logger.error(err);
        }
        finally {
            if (owns())
                this._release(kind, name);
        }
    }
    /**
     * Takes the name. The check turns false once anyone claims it after.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    _claim(kind, name) {
        const key = structures_1.Timer.idOf(kind, name);
        const claim = ++this.claims;
        this.generations.set(key, claim);
        return () => this.generations.get(key) === claim;
    }
    /**
     * Drops the claim. Only when nothing is armed under the name.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    _release(kind, name) {
        this.generations.delete(structures_1.Timer.idOf(kind, name));
    }
    /**
     * Disarms and deletes the row. The delete waits behind any tick still writing.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether something was armed, and whether a row went.
     */
    async stop(kind, name) {
        const cleared = this.clear(kind, name);
        await this._reportCancel(kind, name, cleared);
        if (!(await this.timers.ready))
            return { cleared, forgotten: false };
        const result = await this._queue(kind, name, () => structures_1.Database.delete(kind, name)).catch(logger_1.Logger.error);
        return { cleared, forgotten: !!result && (result.affected ?? 0) > 0 };
    }
    /**
     * New duration, everything else kept. Refuses crons, firing timeouts and code that no longer compiles.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param duration New delay or tick length, in ms.
     * @returns Whether a stored timer moved.
     */
    async reschedule(kind, name, duration) {
        return this._locked(kind, name, async (timer) => {
            if (!timer || this.firing.has(timer.id))
                return false;
            if (timer.kind === structures_1.TimerKind.cron) {
                logger_1.Logger.warn(`Cannot give cron "${name}" a duration: its schedule is an expression.`);
                return false;
            }
            const run = this._runnable(timer, "reschedule");
            if (!run)
                return false;
            this.clear(kind, name);
            timer.duration = duration;
            timer.fireAt = (timer.pausedAt ?? Date.now()) + duration;
            await structures_1.Database.set(timer).catch(logger_1.Logger.error);
            if (!timer.isPaused())
                this._arm(timer, run);
            return true;
        });
    }
    /**
     * New expression for a stored cron. Check it before `clear`, a bad one would leave the cron cancelled.
     * @param name Cron name.
     * @param expression Expression to run on from now.
     * @param timezone Zone to read it in, null keeps the old one.
     * @returns Whether a stored cron moved.
     */
    async rescheduleCron(name, expression, timezone) {
        return this._locked(structures_1.TimerKind.cron, name, async (timer) => {
            if (!timer || timer.kind !== structures_1.TimerKind.cron)
                return false;
            const zone = timezone ?? timer.timezone;
            const invalid = (0, cron_1.cronError)(expression, zone);
            if (invalid) {
                logger_1.Logger.warn(`Cannot reschedule cron "${name}": "${expression}" cannot be read: ${invalid}`);
                return false;
            }
            const run = this._runnable(timer, "reschedule");
            if (!run)
                return false;
            this.clear(structures_1.TimerKind.cron, name);
            timer.cron = expression;
            timer.timezone = zone;
            timer.scheduleNext();
            // paused stays paused, wakes on the next occurrence of the new expression
            await structures_1.Database.set(timer).catch(logger_1.Logger.error);
            if (!timer.isPaused())
                this._arm(timer, run);
            return true;
        });
    }
    /**
     * Holds a timer, keeping what is left of its wait. Refuses a firing timeout.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether it got held.
     */
    async pause(kind, name) {
        return this._locked(kind, name, async (timer) => {
            if (!timer || timer.isPaused() || this.firing.has(timer.id))
                return false;
            const previous = this._snapshot(timer);
            this.clear(kind, name);
            timer.pausedAt = Date.now();
            await structures_1.Database.set(timer).catch(logger_1.Logger.error);
            this._report(types_1.TimerEvent.timerPause, timer, undefined, previous);
            return true;
        });
    }
    /**
     * Restarts a held timer from what was left. A cron jumps to its next occurrence instead.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether it restarted.
     */
    async resume(kind, name) {
        return this._locked(kind, name, async (timer) => {
            if (!timer?.isPaused())
                return false;
            const run = this._runnable(timer, "resume");
            if (!run)
                return false;
            const previous = this._snapshot(timer);
            if (timer.isCron())
                timer.scheduleNext();
            else
                timer.fireAt = Date.now() + timer.timeLeft();
            timer.pausedAt = null;
            await structures_1.Database.set(timer).catch(logger_1.Logger.error);
            // an orphaned handle would keep running beside the new one
            this.clear(kind, name);
            this._arm(timer, run);
            this._report(types_1.TimerEvent.timerResume, timer, undefined, previous);
            return true;
        });
    }
    /**
     * Runs the stored code once. Schedule, row and events stay untouched.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether the code ran.
     */
    async execute(kind, name) {
        const timer = await this._stored(kind, name);
        if (!timer)
            return false;
        const run = this._runnable(timer, "execute");
        if (!run)
            return false;
        const outcome = await run();
        return outcome.ran;
    }
    /**
     * The row once pending writes land. null without a backend.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    async _stored(kind, name) {
        if (!(await this.timers.ready))
            return null;
        await this._settled(kind, name);
        return await structures_1.Database.get(kind, name).catch(logger_1.Logger.error);
    }
    /**
     * Disarms everything and empties storage. Waits for writes in flight first, or they bring rows back.
     * @returns How many armed timers got cancelled.
     */
    async wipe() {
        let cleared = 0;
        for (const kind of Object.values(structures_1.TimerKind)) {
            for (const name of [...(this.mapOf(kind)?.keys() ?? [])]) {
                if (!this.clear(kind, name))
                    continue;
                cleared++;
                await this._reportCancel(kind, name, true);
            }
        }
        this.generations.clear();
        if (!(await this.timers.ready))
            return cleared;
        await Promise.all(this.writes.values());
        await structures_1.Database.wipe().catch(logger_1.Logger.error);
        return cleared;
    }
    /**
     * Handle map for a kind, all three on the client. The cron one is ours, set in `init`.
     * @param kind Timer kind.
     */
    mapOf(kind) {
        const { timeouts, intervals, crons } = this.client;
        const maps = { timeout: timeouts, interval: intervals, cron: crons };
        // a row from a newer build can carry any kind, toString too
        return Object.hasOwn(maps, kind) ? maps[kind] : undefined;
    }
    /**
     * Armed or claimed in this process. Says nothing about the row.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    isLive(kind, name) {
        return !!this.mapOf(kind)?.has(name) || this.generations.has(structures_1.Timer.idOf(kind, name));
    }
    /**
     * Disarms everything, keeps the rows. The next boot restores them.
     */
    standDown() {
        for (const kind of Object.values(structures_1.TimerKind)) {
            const map = this.mapOf(kind);
            if (!map)
                continue;
            for (const name of [...map.keys()])
                this.clear(kind, name);
        }
        this.generations.clear();
    }
    /**
     * Is there a row? Whatever is armed does not matter.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    async exists(kind, name) {
        return !!(await this._stored(kind, name));
    }
    /**
     * Kind config with the timer's own options on top.
     * @param timer Timer to resolve for.
     */
    configFor(timer) {
        const config = this.timers.configOf(timer.kind);
        return timer.config ? { ...config, ...(0, overrides_1.readOverrides)(timer.config) } : config;
    }
    /**
     * Why this cron cannot be armed, null when it can.
     * @param timer Cron to check.
     */
    _cronFault(timer) {
        if (!timer.isCron())
            return "it is a cron with no expression to run on";
        const invalid = (0, cron_1.cronError)(timer.cron, timer.timezone);
        return invalid ? `its expression "${timer.cron}" can no longer be read: ${invalid}` : null;
    }
    /**
     * setLongTimeout plus the map entry. The map holds the pending chunk, the one `clear` has to cancel.
     * A throw inside gets logged, the timer stays as it was.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param delay Wait in ms.
     * @param fn Tick body.
     */
    _schedule(kind, name, delay, fn) {
        const map = this.mapOf(kind);
        const guarded = async () => {
            try {
                await fn();
            }
            catch (err) {
                logger_1.Logger.error(err);
                logger_1.Logger.warn(`${kind} "${name}" threw on its own tick, and was left as it was.`);
            }
        };
        (0, schedule_1.setLongTimeout)(delay, guarded, (handle) => map?.set(name, handle));
    }
    /**
     * Claims the name and schedules by kind.
     * @param timer Timer to arm.
     * @param run What it runs.
     */
    _arm(timer, run) {
        const owns = this._claim(timer.kind, timer.name);
        switch (timer.kind) {
            case structures_1.TimerKind.interval:
            case structures_1.TimerKind.cron:
                return this._armRepeating(timer, run, owns);
            case structures_1.TimerKind.timeout:
                return this._armTimeout(timer, run, owns);
            default:
                return this._assertNever(timer.kind, timer.name);
        }
    }
    /**
     * One run, then the row is spent. Checks the claim before running, an orphaned handle must not fire.
     * @param timer Timeout to schedule.
     * @param run What it runs.
     * @param owns Whether the name is still ours.
     */
    _armTimeout(timer, run, owns) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            if (owns())
                await this._fire(timer, run, owns);
        });
    }
    /**
     * Writes the next due time, re-arms, then runs. Lost the name during the write? Stop there.
     * @param timer Interval or cron to schedule.
     * @param run What it runs every tick.
     * @param owns Whether the name is still ours.
     */
    _armRepeating(timer, run, owns) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            if (!owns())
                return;
            const previous = this._snapshot(timer);
            await this._saveHeld(timer.advance(), owns);
            if (!owns())
                return;
            this._armRepeating(timer, run, owns);
            const outcome = await run();
            if (outcome.ran)
                this._report(types_1.TimerEvent.timerFire, timer, undefined, previous);
        });
    }
    /**
     * Compiles now, fetches from discord on the first run.
     * @param timer Timer to build a runner for.
     */
    _runnerFor(timer) {
        let compiled;
        try {
            compiled = forgescript_1.Compiler.compile(timer.code, timer.path);
        }
        catch (err) {
            logger_1.Logger.untagged(err);
            return { ok: false, gone: true, reason: "its code no longer compiles" };
        }
        const version = timer.version ?? 0;
        const keywords = (0, structures_1.restoreVars)(timer.vars?.keywords, version);
        const environment = (0, structures_1.restoreVars)(timer.vars?.environment, version);
        let resolved = null;
        let command = null;
        const run = async () => {
            if (!resolved) {
                const attempt = await this._resolve(timer);
                if (!attempt.ok) {
                    logger_1.Logger.warn(`Could not run ${timer.kind} "${timer.name}" yet: ${attempt.reason}`);
                    return { ran: false };
                }
                resolved = attempt.resolved;
                // once per runner, the command file won't move mid-run
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
                localFunctions: (0, structures_1.rehydrateLocalFunctions)(timer.vars?.localFunctions, timer.path, "ForgeTimers"),
                args: timer.args ?? [],
                author: resolved.author,
                authorMember: resolved.authorMember,
                timer,
            });
            await forgescript_1.Interpreter.run(ctx).catch(logger_1.Logger.error);
            return { ran: true };
        };
        return { ok: true, run };
    }
    /**
     * The runner, or null with a warning when the timer can't run.
     * @param timer Timer to build a runner for.
     * @param doing What the caller was about to do, for the warning.
     */
    _runnable(timer, doing) {
        const runner = this._runnerFor(timer);
        if (runner.ok)
            return runner.run;
        logger_1.Logger.warn(`Cannot ${doing} ${timer.kind} "${timer.name}": ${runner.reason}`);
        return null;
    }
    /**
     * Live command by path, then by name. null once it is gone.
     * @param timer Timer to look up.
     */
    _commandFor(timer) {
        if (!timer.path && !timer.commandName)
            return null;
        const commands = this.client.commands?.toArray() ?? [];
        return (commands.find((command) => (timer.path && command.data.path === timer.path) ||
            (timer.commandName && command.data.name === timer.commandName)) ?? null);
    }
    /**
     * Target, author and member for a restored run. Author gets refetched unless the target is theirs.
     * @param timer Timer about to run.
     */
    async _resolve(timer) {
        const target = await this._rebuildTarget(timer);
        if (!target.ok)
            return target;
        const obj = target.obj;
        const owner = obj;
        const targetAuthorID = owner.author?.id ?? owner.user?.id ?? null;
        const author = timer.authorID && targetAuthorID !== timer.authorID
            ? await this.client.users.fetch(timer.authorID).catch(() => null)
            : null;
        const guild = timer.guildID ? this.client.guilds.cache.get(timer.guildID) : undefined;
        const authorMember = author && guild ? await guild.members.fetch(author.id).catch(() => null) : null;
        return { ok: true, resolved: { obj, author, authorMember } };
    }
    /**
     * Message, else channel, else nothing. A 404 channel still runs, other errors retry next boot.
     * @param timer Timer to rebuild the target for.
     */
    async _rebuildTarget(timer) {
        if (!timer.channelID)
            return { ok: true, obj: {} };
        let channel;
        try {
            channel = await this.client.channels.fetch(timer.channelID);
        }
        catch (err) {
            if (!isGone(err)) {
                return {
                    ok: false,
                    gone: false,
                    reason: `channel ${timer.channelID} could not be fetched: ${reasonOf(err)}`,
                };
            }
            channel = null;
        }
        if (!channel) {
            logger_1.Logger.warn(`${timer.kind} "${timer.name}" runs without a target: channel ${timer.channelID} is gone`);
            return { ok: true, obj: {} };
        }
        if (timer.messageID && "messages" in channel) {
            const message = await channel.messages.fetch(timer.messageID).catch(() => null);
            if (message)
                return { ok: true, obj: message };
        }
        return { ok: true, obj: channel };
    }
    /**
     * Should this process run it? Guildless ones go to shard 0, the rest by the shard formula.
     * Unknown guilds stay unless pruneUnknownGuilds, it may be an outage.
     * @param timer Timer being restored.
     */
    async _owns(timer) {
        if (!timer.guildID) {
            // pick one shard, or every shard runs it
            return !this.client.shard || this.client.shard.ids.includes(0);
        }
        if (this.client.shard) {
            const owner = discord_js_1.ShardClientUtil.shardIdForGuildId(timer.guildID, this.client.shard.count);
            if (!this.client.shard.ids.includes(owner))
                return false;
        }
        if (this.timers.options.pruneUnknownGuilds && !this.client.guilds.cache.has(timer.guildID)) {
            const dropReason = `guild ${timer.guildID} is not one this process is in`;
            logger_1.Logger.warn(`Dropping ${timer.kind} "${timer.name}": ${dropReason}`);
            this._report(types_1.TimerEvent.timerDrop, timer, { dropReason });
            await this._forget(timer);
            return false;
        }
        return true;
    }
    /**
     * Re-arms stored timers on boot and drops what cannot run. Due runs start after the scan.
     */
    async _restore() {
        if (!(await this.timers.ready))
            return;
        const timers = await structures_1.Database.getAll().catch(logger_1.Logger.error);
        if (!timers)
            return;
        const dueNow = [];
        let restored = 0;
        let dropped = 0;
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
            const config = this.configFor(timer);
            if (config.persist === false) {
                this._report(types_1.TimerEvent.timerDrop, timer, { dropReason: `persist is off for ${timer.kind}s` });
                await this._forget(timer);
                dropped++;
                continue;
            }
            // unreadable expression, no next occurrence
            const unreadable = timer.kind === structures_1.TimerKind.cron ? this._cronFault(timer) : null;
            if (unreadable) {
                logger_1.Logger.warn(`Dropping cron "${timer.name}": ${unreadable}`);
                this._report(types_1.TimerEvent.timerDrop, timer, { dropReason: unreadable });
                await this._forget(timer);
                dropped++;
                continue;
            }
            const runner = this._runnerFor(timer);
            if (!runner.ok) {
                if (runner.gone) {
                    logger_1.Logger.warn(`Dropping ${timer.kind} "${timer.name}": ${runner.reason}`);
                    this._report(types_1.TimerEvent.timerDrop, timer, { dropReason: runner.reason });
                    await this._forget(timer);
                    dropped++;
                }
                else {
                    logger_1.Logger.warn(`Keeping ${timer.kind} "${timer.name}" for the next boot: ${runner.reason}`);
                }
                continue;
            }
            // paused, keep as is with nothing to arm
            if (timer.isPaused()) {
                this._report(types_1.TimerEvent.timerRestore, timer, { overdueBy: 0 });
                restored++;
                continue;
            }
            const run = runner.run;
            const overdueBy = timer.overdueBy();
            const late = !!(overdueBy && config.maxOverdue && overdueBy > config.maxOverdue);
            switch (timer.kind) {
                case structures_1.TimerKind.timeout:
                    if (await this._restoreTimeout(timer, { config, overdueBy, late }, run, dueNow))
                        restored++;
                    else
                        dropped++;
                    break;
                case structures_1.TimerKind.interval:
                case structures_1.TimerKind.cron:
                    if (await this._restoreRepeating(timer, { config, overdueBy, late }, run, dueNow))
                        restored++;
                    else
                        dropped++;
                    break;
                default:
                    this._assertNever(timer.kind, timer.name);
            }
        }
        await Promise.allSettled(dueNow.map((task) => task()));
        const { emitter } = this.timers;
        if (emitter.listenerCount(types_1.TimerEvent.timersReady)) {
            (0, emit_1.emitSafely)(emitter, types_1.TimerEvent.timersReady, { event: { restored, dropped } });
        }
    }
    /**
     * Drops it if too late, queues it if due, arms it otherwise.
     * @param timer Timeout being restored.
     * @param timing Lateness and the config judging it.
     * @param run What it runs.
     * @param dueNow Runs already due, started after the scan.
     * @returns Whether it was kept, for the timersReady count.
     */
    async _restoreTimeout(timer, timing, run, dueNow) {
        if (timing.late) {
            logger_1.Logger.warn(`Discarding timeout "${timer.name}": overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms)`);
            this._report(types_1.TimerEvent.timerDrop, timer, {
                dropReason: `overdue by ${timing.overdueBy}ms, more than the ${timing.config.maxOverdue}ms allowed`,
                overdueBy: timing.overdueBy,
            });
            await this._forget(timer);
            return false;
        }
        this._report(types_1.TimerEvent.timerRestore, timer, { overdueBy: timing.overdueBy });
        if (!timer.isOverdue()) {
            this._arm(timer, run);
            return true;
        }
        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name))
                return;
            await this._claimed(timer.kind, timer.name, (owns) => this._fire(timer, run, owns));
        });
        return true;
    }
    /**
     * Skips to the schedule if too late, replays up to the limit if due, arms it otherwise.
     * @param timer Interval or cron being restored.
     * @param timing Lateness and the config judging it.
     * @param run What it runs every tick.
     * @param dueNow Replays already due, started after the scan.
     * @returns Always true, lateness costs a tick and not the timer.
     */
    async _restoreRepeating(timer, timing, run, dueNow) {
        this._report(types_1.TimerEvent.timerRestore, timer, { overdueBy: timing.overdueBy });
        if (timing.late) {
            logger_1.Logger.warn(`${timer.kind} "${timer.name}": skipping a run overdue by ${timing.overdueBy}ms ` +
                `(max ${timing.config.maxOverdue}ms), resuming schedule`);
            await this._save(timer.scheduleNext());
            this._arm(timer, run);
            return true;
        }
        if (!timer.isOverdue()) {
            this._arm(timer, run);
            return true;
        }
        const missed = timer.missedTicks(timing.config.restoredTicksLimit ?? 0);
        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name))
                return;
            await this._claimed(timer.kind, timer.name, async (owns) => {
                await this._replay(timer, missed, timing.config.restoredTicksLimit, run, owns);
                // replay takes time, the name may have changed hands
                if (!owns())
                    return;
                await this._saveHeld(timer.scheduleNext(), owns);
                if (!owns())
                    return;
                // _arm takes a fresh claim, _claimed then leaves it alone
                this._arm(timer, run);
            });
        });
        return true;
    }
    /**
     * Unknown kind, likely stored by a newer build. Warn and skip.
     * @param kind Kind nothing handles.
     * @param name Timer name.
     */
    _assertNever(kind, name) {
        logger_1.Logger.warn(`Skipping timer "${name}": unsupported kind "${kind}"`);
    }
    /**
     * Runs missed ticks up to the limit. Stops on an outage or a lost name.
     * @param timer Interval or cron being restored.
     * @param missed Ticks missed while down.
     * @param limit Resolved restoredTicksLimit, the timer's own beats its kind's.
     * @param run What it runs every tick.
     * @param owns Whether the name is still ours.
     */
    async _replay(timer, missed, limit, run, owns) {
        if (!limit)
            return;
        const toRun = Math.min(missed, limit);
        if (toRun <= 0)
            return;
        const behind = timer.isCron() ? `more than ${toRun}` : `${missed}`;
        logger_1.Logger.warn(missed > toRun
            ? `${timer.kind} "${timer.name}": replaying ${toRun} of ${behind} missed.`
            : `${timer.kind} "${timer.name}": replaying ${toRun} missed.`);
        for (let i = 0; i < toRun; i++) {
            const outcome = await run();
            if (!outcome.ran)
                return;
            this._report(types_1.TimerEvent.timerFire, timer);
            if (!owns())
                return;
        }
    }
}
exports.TimersManager = TimersManager;
//# sourceMappingURL=TimersManager.js.map