import { Compiler, ForgeClient, Interpreter, Sendable } from "@tryforge/forgescript"
import { DiscordAPIError, Events, GuildMember, ShardClientUtil, User } from "discord.js"
import { Database, rehydrateLocalFunctions, restoreVars, Timer, TimerContext, TimerKind } from "../structures"
import { ForgeTimers } from ".."
import { ITimerEventData, ITimerOverrides, TimerEvent } from "../types"
import { readOverrides } from "../functions/overrides"
import { cronError } from "../functions/cron"
import { setLongTimeout } from "../functions/schedule"
import { emitSafely } from "../functions/emit"
import { Logger } from "../functions/logger"

interface IRestoreTiming {
    config: ITimerOverrides
    /** How far past due, in ms. 0 when not due yet. */
    overdueBy: number
    /** Past this kind's `maxOverdue`. */
    late: boolean
}

interface IRestoreFailure {
    ok: false

    /** Code won't compile. Drop the row, a retry won't help. */
    gone: boolean
    reason: string
}

interface IRunOutcome {
    /** False only on a discord outage. */
    ran: boolean
}

export interface IStopResult {
    /** Something was armed or mid-run under the name. */
    cleared: boolean

    /** A row got deleted. */
    forgotten: boolean
}

type Runner = () => Promise<IRunOutcome>

type IRunnerResult = { ok: true; run: Runner } | IRestoreFailure
type ITargetResult = { ok: true; obj: Sendable } | IRestoreFailure

interface IResolved {
    obj: Sendable
    author: User | null
    authorMember: GuildMember | null
}

type IResolveResult = { ok: true; resolved: IResolved } | IRestoreFailure

function isGone(err: unknown) {
    return err instanceof DiscordAPIError && err.status === 404
}

function reasonOf(err: unknown) {
    return err instanceof Error ? err.message : String(err)
}

export class TimersManager {
    private readonly timers: ForgeTimers

    private claims = 0

    private readonly generations = new Map<string, number>()

    /** Last queued write per timer. Only `_queue` writes here. */
    private readonly writes = new Map<string, Promise<void>>()

    /** Timeouts mid-run. */
    private readonly firing = new Set<string>()

    /**
     * Restores stored timers once the client is ready and storage is open.
     * @param client Client the timers run on.
     */
    public constructor(private readonly client: ForgeClient) {
        this.timers = ForgeTimers.of(client)

        client.once(Events.ClientReady, async () => {
            if (!(await this.timers.ready)) return
            await this._restore()
        })
    }

    /**
     * Arms and stores a new timer. Anything under the same name gets replaced.
     * @param timer Timer to start.
     * @param run Its code, already bound to the calling context.
     */
    public async start(timer: Timer, run: () => Promise<void>) {
        const persisted = await this.timers.ready

        if (this.clear(timer.kind, timer.name)) {
            Logger.warn(`Replacing existing ${timer.kind} "${timer.name}"`)
        }

        if (persisted) await this._save(timer)

        // a live run has its target already, no outage to hit
        this._arm(timer, async () => {
            await run()
            return { ran: true }
        })

        this._report(TimerEvent.timerStart, timer)
        return timer
    }

    /**
     * Disarms only, the row stays. Use `stop` to forget it too.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns True if something was armed or mid-run.
     */
    public clear(kind: TimerKind, name: string) {
        const map = this.mapOf(kind)
        const handle = map?.get(name)

        if (map && handle) {
            // ours all come from setLongTimeout, and clearTimeout stops a core setInterval handle too
            clearTimeout(handle)
            map.delete(name)
        }

        // a restored run can hold the name with nothing in the map
        const held = this.generations.has(Timer.idOf(kind, name))
        this._release(kind, name)

        return !!handle || held
    }

    /**
     * Every write for one timer goes through here, in call order.
     * Skip it and a tick landing late can undo a pause.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param write Runs once earlier writes have landed.
     */
    private _queue<T>(kind: TimerKind, name: string, write: () => Promise<T>): Promise<T> {
        const key = Timer.idOf(kind, name)
        const next = (this.writes.get(key) ?? Promise.resolve()).then(write)
        const settled = next.then(
            () => undefined,
            () => undefined
        )

        this.writes.set(key, settled)
        void settled.then(() => {
            if (this.writes.get(key) === settled) this.writes.delete(key)
        })

        return next
    }

    /**
     * Pending writes for this timer. Await before reading the row.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private _settled(kind: TimerKind, name: string) {
        return this.writes.get(Timer.idOf(kind, name)) ?? Promise.resolve()
    }

    /**
     * Read, change and write in one queue turn.
     * Inside `change` write through Database directly, `_save` would wait on itself.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param change Gets the stored timer, or null.
     * @returns Whatever `change` said, false with no backend.
     */
    private async _locked(kind: TimerKind, name: string, change: (stored: Timer | null) => Promise<boolean>) {
        if (!(await this.timers.ready)) return false

        return this._queue(kind, name, async () => change((await Database.get(kind, name).catch(Logger.error)) || null))
    }

    /**
     * Queued write of the timer as it is now.
     * @param timer Timer to write.
     */
    private _save(timer: Timer) {
        return this._queue(timer.kind, timer.name, () => Database.set(timer)).catch(Logger.error)
    }

    /**
     * Tick write. Dropped if the name changed hands before its turn, the new owner already wrote.
     * @param timer Timer to write.
     * @param owns Checked when the turn comes, not now.
     */
    private _saveHeld(timer: Timer, owns: () => boolean) {
        return this._queue(timer.kind, timer.name, async () => {
            if (owns()) await Database.set(timer)
        }).catch(Logger.error)
    }

    /**
     * Queued delete of the row.
     * @param timer Timer to forget.
     */
    private _forget(timer: Timer) {
        return this._queue(timer.kind, timer.name, () => Database.delete(timer.kind, timer.name)).catch(Logger.error)
    }

    /**
     * Runs a timeout and spends it. Pause and reschedule refuse it until done, or it runs twice.
     * @param timer Timeout that fires.
     * @param run What it runs.
     * @param owns Whether the name is still ours.
     */
    private async _fire(timer: Timer, run: Runner, owns: () => boolean) {
        this.firing.add(timer.id)

        try {
            const outcome = await run()
            if (!owns()) return

            this.client.timeouts.delete(timer.name)
            this._release(timer.kind, timer.name)

            await this._settle(timer, outcome)
        } finally {
            this.firing.delete(timer.id)
        }
    }

    /**
     * Reports the fire and drops the row. On an outage (`ran` false) the row stays for the next boot.
     * @param timer Timeout that ran.
     * @param outcome How the run went.
     */
    private async _settle(timer: Timer, outcome: IRunOutcome) {
        if (!outcome.ran) return

        this._report(TimerEvent.timerFire, timer)
        await this._forget(timer)
    }

    /**
     * Emits only with listeners. A throwing listener gets logged, never rethrown.
     * @param name Event to emit.
     * @param timer For `$timerData` and `$newTimer`.
     * @param event Extras for `$eventData`.
     * @param previous For `$oldTimer`.
     */
    private _report(name: TimerEvent, timer: Timer, event?: ITimerEventData, previous?: Timer) {
        const { emitter } = this.timers
        if (!emitter.listenerCount(name)) return

        emitSafely(emitter, name, { timer, event, previous })
    }

    /**
     * Copy for events. The original keeps changing after the report.
     * @param timer Timer to copy.
     */
    private _snapshot(timer: Timer) {
        return Timer.from({ ...timer })
    }

    /**
     * timerCancel with the stored row, or a stub when only an armed timer existed.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param wasLive Report a stub even without a row.
     */
    private async _reportCancel(kind: TimerKind, name: string, wasLive: boolean) {
        if (!this.timers.emitter.listenerCount(TimerEvent.timerCancel)) return

        const stored = (await this.timers.ready) ? await Database.get(kind, name).catch(Logger.error) : null
        if (stored) return this._report(TimerEvent.timerCancel, stored)

        if (wasLive) emitSafely(this.timers.emitter, TimerEvent.timerCancel, { timer: Timer.stub(kind, name) })
    }

    /**
     * Holds the name for a restored run with nothing armed yet.
     * Always releases, else the name reads live forever.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param task Gets a check for whether the name is still held.
     */
    private async _claimed(kind: TimerKind, name: string, task: (owns: () => boolean) => Promise<void>) {
        const owns = this._claim(kind, name)

        try {
            await task(owns)
        } catch (err) {
            Logger.error(err)
        } finally {
            if (owns()) this._release(kind, name)
        }
    }

    /**
     * Takes the name. The check turns false once anyone claims it after.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private _claim(kind: TimerKind, name: string) {
        const key = Timer.idOf(kind, name)
        const claim = ++this.claims

        this.generations.set(key, claim)
        return () => this.generations.get(key) === claim
    }

    /**
     * Drops the claim. Only when nothing is armed under the name.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private _release(kind: TimerKind, name: string) {
        this.generations.delete(Timer.idOf(kind, name))
    }

    /**
     * Disarms and deletes the row. The delete waits behind any tick still writing.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether something was armed, and whether a row went.
     */
    public async stop(kind: TimerKind, name: string): Promise<IStopResult> {
        const cleared = this.clear(kind, name)

        await this._reportCancel(kind, name, cleared)

        if (!(await this.timers.ready)) return { cleared, forgotten: false }

        const result = await this._queue(kind, name, () => Database.delete(kind, name)).catch(Logger.error)
        return { cleared, forgotten: !!result && (result.affected ?? 0) > 0 }
    }

    /**
     * New duration, everything else kept. Refuses crons, firing timeouts and code that no longer compiles.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param duration New delay or tick length, in ms.
     * @returns Whether a stored timer moved.
     */
    public async reschedule(kind: TimerKind, name: string, duration: number) {
        return this._locked(kind, name, async (timer) => {
            if (!timer || this.firing.has(timer.id)) return false

            if (timer.kind === TimerKind.cron) {
                Logger.warn(`Cannot give cron "${name}" a duration: its schedule is an expression.`)
                return false
            }

            const run = this._runnable(timer, "reschedule")
            if (!run) return false

            this.clear(kind, name)

            timer.duration = duration
            timer.fireAt = (timer.pausedAt ?? Date.now()) + duration

            await Database.set(timer).catch(Logger.error)

            if (!timer.isPaused()) this._arm(timer, run)
            return true
        })
    }

    /**
     * New expression for a stored cron. Check it before `clear`, a bad one would leave the cron cancelled.
     * @param name Cron name.
     * @param expression Expression to run on from now.
     * @param timezone Zone to read it in, null keeps the old one.
     * @returns Whether a stored cron moved.
     */
    public async rescheduleCron(name: string, expression: string, timezone?: string | null) {
        return this._locked(TimerKind.cron, name, async (timer) => {
            if (!timer || timer.kind !== TimerKind.cron) return false

            const zone = timezone ?? timer.timezone

            const invalid = cronError(expression, zone)
            if (invalid) {
                Logger.warn(`Cannot reschedule cron "${name}": "${expression}" cannot be read: ${invalid}`)
                return false
            }

            const run = this._runnable(timer, "reschedule")
            if (!run) return false

            this.clear(TimerKind.cron, name)

            timer.cron = expression
            timer.timezone = zone
            timer.scheduleNext()

            // paused stays paused, wakes on the next occurrence of the new expression
            await Database.set(timer).catch(Logger.error)

            if (!timer.isPaused()) this._arm(timer, run)
            return true
        })
    }

    /**
     * Holds a timer, keeping what is left of its wait. Refuses a firing timeout.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether it got held.
     */
    public async pause(kind: TimerKind, name: string) {
        return this._locked(kind, name, async (timer) => {
            if (!timer || timer.isPaused() || this.firing.has(timer.id)) return false

            const previous = this._snapshot(timer)
            this.clear(kind, name)

            timer.pausedAt = Date.now()
            await Database.set(timer).catch(Logger.error)

            this._report(TimerEvent.timerPause, timer, undefined, previous)
            return true
        })
    }

    /**
     * Restarts a held timer from what was left. A cron jumps to its next occurrence instead.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether it restarted.
     */
    public async resume(kind: TimerKind, name: string) {
        return this._locked(kind, name, async (timer) => {
            if (!timer?.isPaused()) return false

            const run = this._runnable(timer, "resume")
            if (!run) return false

            const previous = this._snapshot(timer)

            if (timer.isCron()) timer.scheduleNext()
            else timer.fireAt = Date.now() + timer.timeLeft()

            timer.pausedAt = null
            await Database.set(timer).catch(Logger.error)

            // an orphaned handle would keep running beside the new one
            this.clear(kind, name)
            this._arm(timer, run)

            this._report(TimerEvent.timerResume, timer, undefined, previous)
            return true
        })
    }

    /**
     * Runs the stored code once. Schedule, row and events stay untouched.
     * @param kind Timer kind.
     * @param name Timer name.
     * @returns Whether the code ran.
     */
    public async execute(kind: TimerKind, name: string) {
        const timer = await this._stored(kind, name)
        if (!timer) return false

        const run = this._runnable(timer, "execute")
        if (!run) return false

        const outcome = await run()
        return outcome.ran
    }

    /**
     * The row once pending writes land. null without a backend.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    private async _stored(kind: TimerKind, name: string) {
        if (!(await this.timers.ready)) return null

        await this._settled(kind, name)
        return await Database.get(kind, name).catch(Logger.error)
    }

    /**
     * Disarms everything and empties storage. Waits for writes in flight first, or they bring rows back.
     * @returns How many armed timers got cancelled.
     */
    public async wipe() {
        let cleared = 0

        for (const kind of Object.values(TimerKind)) {
            for (const name of [...(this.mapOf(kind)?.keys() ?? [])]) {
                if (!this.clear(kind, name)) continue

                cleared++
                await this._reportCancel(kind, name, true)
            }
        }

        this.generations.clear()

        if (!(await this.timers.ready)) return cleared

        await Promise.all(this.writes.values())
        await Database.wipe().catch(Logger.error)
        return cleared
    }

    /**
     * Handle map for a kind, all three on the client. The cron one is ours, set in `init`.
     * @param kind Timer kind.
     */
    public mapOf(kind: TimerKind): Map<string, NodeJS.Timeout> | undefined {
        const { timeouts, intervals, crons } = this.client
        const maps = { timeout: timeouts, interval: intervals, cron: crons }

        // a row from a newer build can carry any kind, toString too
        return Object.hasOwn(maps, kind) ? maps[kind] : undefined
    }

    /**
     * Armed or claimed in this process. Says nothing about the row.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    public isLive(kind: TimerKind, name: string) {
        return !!this.mapOf(kind)?.has(name) || this.generations.has(Timer.idOf(kind, name))
    }

    /**
     * Disarms everything, keeps the rows. The next boot restores them.
     */
    public standDown() {
        for (const kind of Object.values(TimerKind)) {
            const map = this.mapOf(kind)
            if (!map) continue

            for (const name of [...map.keys()]) this.clear(kind, name)
        }

        this.generations.clear()
    }

    /**
     * Is there a row? Whatever is armed does not matter.
     * @param kind Timer kind.
     * @param name Timer name.
     */
    public async exists(kind: TimerKind, name: string) {
        return !!(await this._stored(kind, name))
    }

    /**
     * Kind config with the timer's own options on top.
     * @param timer Timer to resolve for.
     */
    private configFor(timer: Timer): ITimerOverrides {
        const config = this.timers.configOf(timer.kind)
        return timer.config ? { ...config, ...readOverrides(timer.config) } : config
    }

    /**
     * Why this cron cannot be armed, null when it can.
     * @param timer Cron to check.
     */
    private _cronFault(timer: Timer) {
        if (!timer.isCron()) return "it is a cron with no expression to run on"

        const invalid = cronError(timer.cron, timer.timezone)
        return invalid ? `its expression "${timer.cron}" can no longer be read: ${invalid}` : null
    }

    /**
     * setLongTimeout plus the map entry. The map holds the pending chunk, the one `clear` has to cancel.
     * A throw inside gets logged, the timer stays as it was.
     * @param kind Timer kind.
     * @param name Timer name.
     * @param delay Wait in ms.
     * @param fn Tick body.
     */
    private _schedule(kind: TimerKind, name: string, delay: number, fn: () => unknown) {
        const map = this.mapOf(kind)

        const guarded = async () => {
            try {
                await fn()
            } catch (err) {
                Logger.error(err)
                Logger.warn(`${kind} "${name}" threw on its own tick, and was left as it was.`)
            }
        }

        setLongTimeout(delay, guarded, (handle) => map?.set(name, handle))
    }

    /**
     * Claims the name and schedules by kind.
     * @param timer Timer to arm.
     * @param run What it runs.
     */
    private _arm(timer: Timer, run: Runner) {
        const owns = this._claim(timer.kind, timer.name)

        switch (timer.kind) {
            case TimerKind.interval:
            case TimerKind.cron:
                return this._armRepeating(timer, run, owns)

            case TimerKind.timeout:
                return this._armTimeout(timer, run, owns)

            default:
                return this._assertNever(timer.kind, timer.name)
        }
    }

    /**
     * One run, then the row is spent. Checks the claim before running, an orphaned handle must not fire.
     * @param timer Timeout to schedule.
     * @param run What it runs.
     * @param owns Whether the name is still ours.
     */
    private _armTimeout(timer: Timer, run: Runner, owns: () => boolean) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            if (owns()) await this._fire(timer, run, owns)
        })
    }

    /**
     * Writes the next due time, re-arms, then runs. Lost the name during the write? Stop there.
     * @param timer Interval or cron to schedule.
     * @param run What it runs every tick.
     * @param owns Whether the name is still ours.
     */
    private _armRepeating(timer: Timer, run: Runner, owns: () => boolean) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            if (!owns()) return

            const previous = this._snapshot(timer)
            await this._saveHeld(timer.advance(), owns)

            if (!owns()) return

            this._armRepeating(timer, run, owns)

            const outcome = await run()
            if (outcome.ran) this._report(TimerEvent.timerFire, timer, undefined, previous)
        })
    }

    /**
     * Compiles now, fetches from discord on the first run.
     * @param timer Timer to build a runner for.
     */
    private _runnerFor(timer: Timer): IRunnerResult {
        let compiled

        try {
            compiled = Compiler.compile(timer.code, timer.path)
        } catch (err) {
            Logger.untagged(err)
            return { ok: false, gone: true, reason: "its code no longer compiles" }
        }

        const version = timer.version ?? 0
        const keywords = restoreVars(timer.vars?.keywords, version)
        const environment = restoreVars(timer.vars?.environment, version)

        let resolved: IResolved | null = null
        let command: ReturnType<TimersManager["_commandFor"]> = null

        const run: Runner = async () => {
            if (!resolved) {
                const attempt = await this._resolve(timer)

                if (!attempt.ok) {
                    Logger.warn(`Could not run ${timer.kind} "${timer.name}" yet: ${attempt.reason}`)
                    return { ran: false }
                }

                resolved = attempt.resolved

                // once per runner, the command file won't move mid-run
                command = this._commandFor(timer)
            }

            const ctx = new TimerContext({
                client: this.client,
                command,
                data: compiled,
                obj: resolved.obj,
                doNotSend: true,
                redirectErrorsToConsole: true,
                keywords: { ...keywords },
                environment: { ...environment },
                localFunctions: rehydrateLocalFunctions(timer.vars?.localFunctions, timer.path, "ForgeTimers"),
                args: timer.args ?? [],
                author: resolved.author,
                authorMember: resolved.authorMember,
                timer,
            })

            await Interpreter.run(ctx).catch(Logger.error)
            return { ran: true }
        }

        return { ok: true, run }
    }

    /**
     * The runner, or null with a warning when the timer can't run.
     * @param timer Timer to build a runner for.
     * @param doing What the caller was about to do, for the warning.
     */
    private _runnable(timer: Timer, doing: string) {
        const runner = this._runnerFor(timer)
        if (runner.ok) return runner.run

        Logger.warn(`Cannot ${doing} ${timer.kind} "${timer.name}": ${runner.reason}`)
        return null
    }

    /**
     * Live command by path, then by name. null once it is gone.
     * @param timer Timer to look up.
     */
    private _commandFor(timer: Timer) {
        if (!timer.path && !timer.commandName) return null

        const commands = this.client.commands?.toArray() ?? []
        return (
            commands.find(
                (command) =>
                    (timer.path && command.data.path === timer.path) ||
                    (timer.commandName && command.data.name === timer.commandName)
            ) ?? null
        )
    }

    /**
     * Target, author and member for a restored run. Author gets refetched unless the target is theirs.
     * @param timer Timer about to run.
     */
    private async _resolve(timer: Timer): Promise<IResolveResult> {
        const target = await this._rebuildTarget(timer)
        if (!target.ok) return target

        const obj = target.obj

        const owner = obj as { author?: { id?: string } | null; user?: { id?: string } | null }
        const targetAuthorID = owner.author?.id ?? owner.user?.id ?? null

        const author =
            timer.authorID && targetAuthorID !== timer.authorID
                ? await this.client.users.fetch(timer.authorID).catch(() => null)
                : null

        const guild = timer.guildID ? this.client.guilds.cache.get(timer.guildID) : undefined
        const authorMember = author && guild ? await guild.members.fetch(author.id).catch(() => null) : null

        return { ok: true, resolved: { obj, author, authorMember } }
    }

    /**
     * Message, else channel, else nothing. A 404 channel still runs, other errors retry next boot.
     * @param timer Timer to rebuild the target for.
     */
    private async _rebuildTarget(timer: Timer): Promise<ITargetResult> {
        if (!timer.channelID) return { ok: true, obj: {} }

        let channel
        try {
            channel = await this.client.channels.fetch(timer.channelID)
        } catch (err) {
            if (!isGone(err)) {
                return {
                    ok: false,
                    gone: false,
                    reason: `channel ${timer.channelID} could not be fetched: ${reasonOf(err)}`,
                }
            }

            channel = null
        }

        if (!channel) {
            Logger.warn(`${timer.kind} "${timer.name}" runs without a target: channel ${timer.channelID} is gone`)
            return { ok: true, obj: {} }
        }

        if (timer.messageID && "messages" in channel) {
            const message = await channel.messages.fetch(timer.messageID).catch(() => null)
            if (message) return { ok: true, obj: message as Sendable }
        }

        return { ok: true, obj: channel as Sendable }
    }

    /**
     * Should this process run it? Guildless ones go to shard 0, the rest by the shard formula.
     * Unknown guilds stay unless pruneUnknownGuilds, it may be an outage.
     * @param timer Timer being restored.
     */
    private async _owns(timer: Timer) {
        if (!timer.guildID) {
            // pick one shard, or every shard runs it
            return !this.client.shard || this.client.shard.ids.includes(0)
        }

        if (this.client.shard) {
            const owner = ShardClientUtil.shardIdForGuildId(timer.guildID, this.client.shard.count)
            if (!this.client.shard.ids.includes(owner)) return false
        }

        if (this.timers.options.pruneUnknownGuilds && !this.client.guilds.cache.has(timer.guildID)) {
            const dropReason = `guild ${timer.guildID} is not one this process is in`

            Logger.warn(`Dropping ${timer.kind} "${timer.name}": ${dropReason}`)
            this._report(TimerEvent.timerDrop, timer, { dropReason })
            await this._forget(timer)

            return false
        }

        return true
    }

    /**
     * Re-arms stored timers on boot and drops what cannot run. Due runs start after the scan.
     */
    private async _restore() {
        if (!(await this.timers.ready)) return

        const timers = await Database.getAll().catch(Logger.error)
        if (!timers) return

        const dueNow: Array<() => Promise<void>> = []
        let restored = 0
        let dropped = 0

        for (const timer of timers) {
            if (this.isLive(timer.kind, timer.name)) {
                Logger.warn(`Skipping ${timer.kind} "${timer.name}": already rescheduled since startup`)
                continue
            }

            if (!(await this._owns(timer))) continue

            const version = timer.version ?? 0
            if (version > Timer.SCHEMA_VERSION) {
                Logger.warn(
                    `Leaving ${timer.kind} "${timer.name}" alone: it was stored under schema ${version}, and this build only understands ${Timer.SCHEMA_VERSION}`
                )
                continue
            }

            const config = this.configFor(timer)
            if (config.persist === false) {
                this._report(TimerEvent.timerDrop, timer, { dropReason: `persist is off for ${timer.kind}s` })
                await this._forget(timer)
                dropped++
                continue
            }

            // unreadable expression, no next occurrence
            const unreadable = timer.kind === TimerKind.cron ? this._cronFault(timer) : null
            if (unreadable) {
                Logger.warn(`Dropping cron "${timer.name}": ${unreadable}`)
                this._report(TimerEvent.timerDrop, timer, { dropReason: unreadable })
                await this._forget(timer)
                dropped++
                continue
            }

            const runner = this._runnerFor(timer)
            if (!runner.ok) {
                if (runner.gone) {
                    Logger.warn(`Dropping ${timer.kind} "${timer.name}": ${runner.reason}`)
                    this._report(TimerEvent.timerDrop, timer, { dropReason: runner.reason })
                    await this._forget(timer)
                    dropped++
                } else {
                    Logger.warn(`Keeping ${timer.kind} "${timer.name}" for the next boot: ${runner.reason}`)
                }
                continue
            }

            // paused, keep as is with nothing to arm
            if (timer.isPaused()) {
                this._report(TimerEvent.timerRestore, timer, { overdueBy: 0 })
                restored++
                continue
            }

            const run = runner.run
            const overdueBy = timer.overdueBy()
            const late = !!(overdueBy && config.maxOverdue && overdueBy > config.maxOverdue)

            switch (timer.kind) {
                case TimerKind.timeout:
                    if (await this._restoreTimeout(timer, { config, overdueBy, late }, run, dueNow)) restored++
                    else dropped++
                    break

                case TimerKind.interval:
                case TimerKind.cron:
                    if (await this._restoreRepeating(timer, { config, overdueBy, late }, run, dueNow)) restored++
                    else dropped++
                    break

                default:
                    this._assertNever(timer.kind, timer.name)
            }
        }

        await Promise.allSettled(dueNow.map((task) => task()))

        const { emitter } = this.timers
        if (emitter.listenerCount(TimerEvent.timersReady)) {
            emitSafely(emitter, TimerEvent.timersReady, { event: { restored, dropped } })
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
    private async _restoreTimeout(
        timer: Timer,
        timing: IRestoreTiming,
        run: Runner,
        dueNow: Array<() => Promise<void>>
    ): Promise<boolean> {
        if (timing.late) {
            Logger.warn(
                `Discarding timeout "${timer.name}": overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms)`
            )
            this._report(TimerEvent.timerDrop, timer, {
                dropReason: `overdue by ${timing.overdueBy}ms, more than the ${timing.config.maxOverdue}ms allowed`,
                overdueBy: timing.overdueBy,
            })
            await this._forget(timer)
            return false
        }

        this._report(TimerEvent.timerRestore, timer, { overdueBy: timing.overdueBy })

        if (!timer.isOverdue()) {
            this._arm(timer, run)
            return true
        }

        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name)) return

            await this._claimed(timer.kind, timer.name, (owns) => this._fire(timer, run, owns))
        })

        return true
    }

    /**
     * Skips to the schedule if too late, replays up to the limit if due, arms it otherwise.
     * @param timer Interval or cron being restored.
     * @param timing Lateness and the config judging it.
     * @param run What it runs every tick.
     * @param dueNow Replays already due, started after the scan.
     * @returns Always true, lateness costs a tick and not the timer.
     */
    private async _restoreRepeating(
        timer: Timer,
        timing: IRestoreTiming,
        run: Runner,
        dueNow: Array<() => Promise<void>>
    ): Promise<boolean> {
        this._report(TimerEvent.timerRestore, timer, { overdueBy: timing.overdueBy })

        if (timing.late) {
            Logger.warn(
                `${timer.kind} "${timer.name}": skipping a run overdue by ${timing.overdueBy}ms ` +
                    `(max ${timing.config.maxOverdue}ms), resuming schedule`
            )
            await this._save(timer.scheduleNext())
            this._arm(timer, run)
            return true
        }

        if (!timer.isOverdue()) {
            this._arm(timer, run)
            return true
        }

        const missed = timer.missedTicks(timing.config.restoredTicksLimit ?? 0)

        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name)) return

            await this._claimed(timer.kind, timer.name, async (owns) => {
                await this._replay(timer, missed, timing.config.restoredTicksLimit, run, owns)

                // replay takes time, the name may have changed hands
                if (!owns()) return

                await this._saveHeld(timer.scheduleNext(), owns)

                if (!owns()) return

                // _arm takes a fresh claim, _claimed then leaves it alone
                this._arm(timer, run)
            })
        })

        return true
    }

    /**
     * Unknown kind, likely stored by a newer build. Warn and skip.
     * @param kind Kind nothing handles.
     * @param name Timer name.
     */
    private _assertNever(kind: never, name: string): void {
        Logger.warn(`Skipping timer "${name}": unsupported kind "${kind}"`)
    }

    /**
     * Runs missed ticks up to the limit. Stops on an outage or a lost name.
     * @param timer Interval or cron being restored.
     * @param missed Ticks missed while down.
     * @param limit Resolved restoredTicksLimit, the timer's own beats its kind's.
     * @param run What it runs every tick.
     * @param owns Whether the name is still ours.
     */
    private async _replay(timer: Timer, missed: number, limit: number | undefined, run: Runner, owns: () => boolean) {
        if (!limit) return

        const toRun = Math.min(missed, limit)
        if (toRun <= 0) return

        const behind = timer.isCron() ? `more than ${toRun}` : `${missed}`

        Logger.warn(
            missed > toRun
                ? `${timer.kind} "${timer.name}": replaying ${toRun} of ${behind} missed.`
                : `${timer.kind} "${timer.name}": replaying ${toRun} missed.`
        )

        for (let i = 0; i < toRun; i++) {
            const outcome = await run()
            if (!outcome.ran) return

            this._report(TimerEvent.timerFire, timer)

            if (!owns()) return
        }
    }
}
