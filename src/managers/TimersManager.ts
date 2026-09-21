import { Compiler, ForgeClient, Interpreter, Sendable } from "@tryforge/forgescript"
import { DiscordAPIError, Events, GuildMember, ShardClientUtil, User } from "discord.js"
import { Database, Timer, TimerContext, TimerKind } from "../structures"
import { ForgeTimers } from ".."
import { ITimerEventData, ITimerOverrides, TimerEvent } from "../types"
import { rehydrateLocalFunctions, restoreVars } from "../functions/snapshotVars"
import { readOverrides } from "../functions/overrides"
import { cronError } from "../functions/cron"
import { setLongTimeout } from "../functions/schedule"
import { Logger } from "../functions/logger"

interface IRestoreTiming {
    config: ITimerOverrides
    /** How far past due the timer is, or 0 if it isn't yet. */
    overdueBy: number
    /** Whether `overdueBy` exceeds this kind's configured `maxOverdue`. */
    late: boolean
}

interface IRestoreFailure {
    ok: false

    /** Whether nothing is worth retrying, which means only that the code will not compile. */
    gone: boolean
    reason: string
}

interface IRunOutcome {
    /** False only when discord could not be reached. */
    ran: boolean
}

export interface IStopResult {
    /** Whether a timer was actually running, or mid-run, under that name. */
    cleared: boolean

    /** Whether a stored record was removed. */
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

    private readonly crons = new Map<string, NodeJS.Timeout>()

    public constructor(private readonly client: ForgeClient) {
        this.timers = client.getExtension(ForgeTimers, true)

        client.once(Events.ClientReady, async () => {
            if (!(await this.timers.ready)) return
            await this._restore()
        })
    }

    /**
     * Schedules a timer and persists it.
     * @param timer The timer to schedule.
     * @param run What it executes when it fires.
     */
    public async start(timer: Timer, run: () => Promise<void>) {
        const persisted = await this.timers.ready

        if (this.clear(timer.kind, timer.name)) {
            Logger.warn(`Replacing existing ${timer.kind} "${timer.name}"`)
        }

        if (persisted) await this._save(timer)

        // live timer already has its target, so it always runs
        this._arm(timer, async () => {
            await run()
            return { ran: true }
        })

        this._report(TimerEvent.timerStart, timer)
        return timer
    }

    /**
     * Cancels a running timer, leaving the database untouched.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether anything was stopped, whether it was scheduled or already mid-run.
     */
    public clear(kind: TimerKind, name: string) {
        const map = this.mapOf(kind)
        const handle = map?.get(name)

        if (map && handle) {
            switch (kind) {
                case TimerKind.interval:
                    clearInterval(handle)
                    break

                // a cron is armed through setLongTimeout
                case TimerKind.timeout:
                case TimerKind.cron:
                    clearTimeout(handle)
                    break
            }

            map.delete(name)
        }

        // a restored run owns its name with nothing scheduled yet
        const held = this.generations.has(Timer.idOf(kind, name))
        this._release(kind, name)

        return !!handle || held
    }

    private _save(timer: Timer) {
        return Database.set(timer).catch(Logger.error)
    }

    private _forget(timer: Timer) {
        return Database.delete(timer.kind, timer.name).catch(Logger.error)
    }

    /** Reports how a one-shot ended, and spends its record only once the run is really over */
    private async _settle(timer: Timer, outcome: IRunOutcome) {
        if (!outcome.ran) return

        // the record waits for the next boot because an outage is not a run
        this._report(TimerEvent.timerFire, timer)
        await this._forget(timer)
    }

    /**
     * @param previous The timer as it was before this event changed it, for `$oldTimer`.
     */
    private _report(name: TimerEvent, timer: Timer, event?: ITimerEventData, previous?: Timer) {
        const { emitter } = this.timers
        if (!emitter.listenerCount(name)) return

        emitter.emit(name, { timer, event, previous })
    }

    /** A copy of a timer as it stands, to hand to an event once the original has moved on */
    private _snapshot(timer: Timer) {
        return Timer.from({ ...timer })
    }

    private async _reportCancel(kind: TimerKind, name: string, wasLive: boolean) {
        if (!this.timers.emitter.listenerCount(TimerEvent.timerCancel)) return

        const stored = (await this.timers.ready) ? await Database.get(kind, name).catch(Logger.error) : null
        if (stored) return this._report(TimerEvent.timerCancel, stored)

        if (wasLive) this.timers.emitter.emit(TimerEvent.timerCancel, { timer: Timer.stub(kind, name) })
    }

    /**
     * Runs a task that holds a name outright, with nothing scheduled to hold it for them.
     *
     * The claim is always handed back, because a name left claimed by a run that never finished
     * would read as live for ever. Arming inside the task takes a claim of its own, and that one
     * is left alone.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @param task What to do while the name is held, given a check for whether it still is.
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

    /** Takes the name over and hands back a check for whether it's still ours */
    private _claim(kind: TimerKind, name: string) {
        const key = Timer.idOf(kind, name)
        const claim = ++this.claims

        this.generations.set(key, claim)
        return () => this.generations.get(key) === claim
    }

    /**
     * Forgets a name nothing is armed under any more.
     */
    private _release(kind: TimerKind, name: string) {
        this.generations.delete(Timer.idOf(kind, name))
    }

    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether anything was stopped, and whether a stored record was removed.
     */
    public async stop(kind: TimerKind, name: string): Promise<IStopResult> {
        const cleared = this.clear(kind, name)

        await this._reportCancel(kind, name, cleared)

        if (!(await this.timers.ready)) return { cleared, forgotten: false }

        const result = await Database.delete(kind, name).catch(Logger.error)
        return { cleared, forgotten: !!result && (result.affected ?? 0) > 0 }
    }

    /**
     * Moves a stored timer's deadline, keeping everything else it was scheduled with.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @param duration The new delay for a timeout, or tick length for an interval, in ms.
     * @returns Whether a stored timer was found and moved.
     */
    public async reschedule(kind: TimerKind, name: string, duration: number) {
        const timer = await this._stored(kind, name)
        if (!timer) return false

        if (timer.kind === TimerKind.cron) {
            Logger.warn(`Cannot give cron "${name}" a duration: its schedule is an expression.`)
            return false
        }

        const runner = this._runnerFor(timer)
        if (!runner.ok) {
            Logger.warn(`Cannot reschedule ${kind} "${name}": ${runner.reason}`)
            return false
        }

        this.clear(kind, name)

        timer.duration = duration
        timer.fireAt = (timer.pausedAt ?? Date.now()) + duration
        await this._save(timer)

        if (!timer.isPaused()) this._arm(timer, runner.run)
        return true
    }

    /**
     * Gives a stored cron a new expression, keeping everything else it was scheduled with.
     *
     * @param name The name of the cron.
     * @param expression The cron expression it should run on from now on.
     * @param timezone The zone to read it in, or null to keep the one it already had.
     * @returns Whether a stored cron was found and moved.
     */
    public async rescheduleCron(name: string, expression: string, timezone?: string | null) {
        const timer = await this._stored(TimerKind.cron, name)
        if (!timer || timer.kind !== TimerKind.cron) return false

        const zone = timezone ?? timer.timezone

        // read before anything is stopped: scheduleNext throws on an expression it cannot parse,
        // and by then the cron would already be cancelled with its old row left behind
        const invalid = cronError(expression, zone)
        if (invalid) {
            Logger.warn(`Cannot reschedule cron "${name}": "${expression}" cannot be read: ${invalid}`)
            return false
        }

        const runner = this._runnerFor(timer)
        if (!runner.ok) {
            Logger.warn(`Cannot reschedule cron "${name}": ${runner.reason}`)
            return false
        }

        this.clear(TimerKind.cron, name)

        timer.cron = expression
        timer.timezone = zone
        timer.scheduleNext()

        // a paused cron keeps its hold, and wakes on the next occurrence of whatever it now runs on
        await this._save(timer)

        if (!timer.isPaused()) this._arm(timer, runner.run)
        return true
    }

    /**
     * Puts a stored timer on hold, keeping what is left of its wait for {@link resume}.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether a running timer was put on hold.
     */
    public async pause(kind: TimerKind, name: string) {
        const timer = await this._stored(kind, name)
        if (!timer || timer.isPaused()) return false

        const previous = this._snapshot(timer)
        this.clear(kind, name)

        timer.pausedAt = Date.now()
        await this._save(timer)

        this._report(TimerEvent.timerPause, timer, undefined, previous)
        return true
    }

    /**
     * Starts a paused timer, from wherever its wait was left.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether a paused timer was started.
     */
    public async resume(kind: TimerKind, name: string) {
        const timer = await this._stored(kind, name)
        if (!timer?.isPaused()) return false

        const runner = this._runnerFor(timer)
        if (!runner.ok) {
            Logger.warn(`Cannot resume ${kind} "${name}": ${runner.reason}`)
            return false
        }

        const previous = this._snapshot(timer)

        if (timer.isCron()) timer.scheduleNext()
        else timer.fireAt = Date.now() + timer.timeLeft()

        timer.pausedAt = null
        await this._save(timer)

        this._arm(timer, runner.run)

        this._report(TimerEvent.timerResume, timer, undefined, previous)
        return true
    }

    /**
     * Runs a stored timer's code once, on demand.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether the code ran.
     */
    public async execute(kind: TimerKind, name: string) {
        const timer = await this._stored(kind, name)
        if (!timer) return false

        const runner = this._runnerFor(timer)
        if (!runner.ok) {
            Logger.warn(`Could not execute ${kind} "${name}": ${runner.reason}`)
            return false
        }

        const outcome = await runner.run()
        return outcome.ran
    }

    /** The stored record for a name, or null when there is no backend or no such row */
    private async _stored(kind: TimerKind, name: string) {
        if (!(await this.timers.ready)) return null
        return await Database.get(kind, name).catch(Logger.error)
    }

    /**
     * Cancels every running timer and empties the table.
     * @returns The number of running timers that were cancelled.
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

        // a restored run holds its name with nothing scheduled to find above, and wiping stands it down too
        this.generations.clear()

        if (!(await this.timers.ready)) return cleared

        await Database.wipe().catch(Logger.error)
        return cleared
    }

    /**
     * The live timer map ForgeScript keeps for a kind.
     * @param kind The kind of the timers.
     */
    public mapOf(kind: TimerKind) {
        switch (kind) {
            case TimerKind.timeout:
                return this.client.timeouts
            case TimerKind.interval:
                return this.client.intervals
            case TimerKind.cron:
                return this.crons
            default:
                // no map for this kind yet, so nothing to schedule
                return undefined
        }
    }

    /**
     * Whether a timer under this name is already running.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    public isLive(kind: TimerKind, name: string) {
        return !!this.mapOf(kind)?.has(name) || this.generations.has(Timer.idOf(kind, name))
    }

    /**
     * Stops everything armed and lets every name go, leaving the database alone.
     * Unlike {@link wipe} nothing is forgotten, so the next boot picks the records back up.
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
     * Whether a record is stored under this name, whatever is or is not armed for it.
     *
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    public async exists(kind: TimerKind, name: string) {
        return !!(await this._stored(kind, name))
    }

    /**
     * A kind's config with the timer's own options laid over it, so a call beats the config.
     * @param timer The timer to resolve the config of.
     */
    private configFor(timer: Timer): ITimerOverrides {
        const { timeoutConfig, intervalConfig, cronConfig } = this.timers.options

        let config: ITimerOverrides
        switch (timer.kind) {
            case TimerKind.timeout:
                config = timeoutConfig ?? {}
                break
            case TimerKind.interval:
                config = intervalConfig ?? {}
                break
            case TimerKind.cron:
                config = cronConfig ?? {}
                break
            default:
                config = {}
        }

        return timer.config ? { ...config, ...readOverrides(timer.config) } : config
    }

    /**
     * Why a stored cron could never be armed, or null when it can.
     * @param timer The cron to look over.
     */
    private _cronFault(timer: Timer) {
        if (!timer.isCron()) return "it is a cron with no expression to run on"

        const invalid = cronError(timer.cron, timer.timezone)
        return invalid ? `its expression "${timer.cron}" can no longer be read: ${invalid}` : null
    }

    /** Arms `fn`, keeping the live map on the pending chunk so {@link clear} cancels the right one */
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

    private _armTimeout(timer: Timer, run: Runner, owns: () => boolean) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            const outcome = await run()

            if (!owns()) return

            this.client.timeouts.delete(timer.name)
            this._release(timer.kind, timer.name)

            await this._settle(timer, outcome)
        })
    }

    private _armRepeating(timer: Timer, run: Runner, owns: () => boolean) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            if (!owns()) return

            const previous = this._snapshot(timer)
            await this._save(timer.advance())

            if (!owns()) {
                // cancelled while that write was in flight, so take the row back out
                if (!this.isLive(timer.kind, timer.name)) await this._forget(timer)
                return
            }

            this._armRepeating(timer, run, owns)

            const outcome = await run()
            if (outcome.ran) this._report(TimerEvent.timerFire, timer, undefined, previous)
        })
    }

    /**
     * Compiles now, fetches later.
     * @param timer The timer to build a runner for.
     */
    private _runnerFor(timer: Timer): IRunnerResult {
        let compiled

        try {
            compiled = Compiler.compile(timer.code, timer.path)
        } catch (err) {
            Logger.untagged(err)
            // won't compile now, won't compile next boot either
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
                    // only an outage lands here, the record is kept and the next boot tries again
                    Logger.warn(`Could not run ${timer.kind} "${timer.name}" yet: ${attempt.reason}`)
                    return { ran: false }
                }

                resolved = attempt.resolved

                // the file a timer came from cannot move under it
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
     * Finds the live command.
     * @param timer The timer to look up.
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

    /** Fetches everything a run needs from discord */
    private async _resolve(timer: Timer): Promise<IResolveResult> {
        const target = await this._rebuildTarget(timer)
        if (!target.ok) return target

        const obj = target.obj
        const hasAuthor = "author" in obj || "user" in obj
        const author =
            timer.authorID && !hasAuthor ? await this.client.users.fetch(timer.authorID).catch(() => null) : null

        const guild = timer.guildID ? this.client.guilds.cache.get(timer.guildID) : undefined
        const authorMember = author && guild ? await guild.members.fetch(author.id).catch(() => null) : null

        return { ok: true, resolved: { obj, author, authorMember } }
    }

    private async _rebuildTarget(timer: Timer): Promise<ITargetResult> {
        // no channel means empty target
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

    // What it can't see is left alone, because it's a sibling shard or an outage. Deleting is opt-in
    /**
     * Whether this process is the one meant to run a timer.
     *
     * @param timer The timer being restored.
     */
    private async _owns(timer: Timer) {
        if (!timer.guildID) {
            // one shard has to be picked or every shard would run it
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

            // an expression that cannot be read has no next occurrence
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

            // a paused timer is kept as it is
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
            emitter.emit(TimerEvent.timersReady, { event: { restored, dropped } })
        }
    }

    /**
     * Drops a one-shot that's too late, otherwise fires or re-arms it.
     * @returns Whether it was kept, so the caller can count what startup saved.
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

            await this._claimed(timer.kind, timer.name, async (owns) => {
                const outcome = await run()
                if (!owns()) return

                this._release(timer.kind, timer.name)
                await this._settle(timer, outcome)
            })
        })

        return true
    }

    /**
     * Resumes a stored repeating timer, replaying what it missed if it is allowed to.
     * @returns Always true: an interval past `maxOverdue` skips the stale tick.
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

                // this name could be cancelled or rescheduled while the replay was running
                if (!owns()) return

                await this._save(timer.scheduleNext())

                if (!owns()) {
                    // cancelled while that write was in flight, take the row back out
                    if (!this.isLive(timer.kind, timer.name)) await this._forget(timer)
                    return
                }

                // arming claims the name again, so what this task held is let go of behind it
                this._arm(timer, run)
            })
        })

        return true
    }

    private _assertNever(kind: never, name: string): void {
        Logger.warn(`Skipping timer "${name}": unsupported kind "${kind}"`)
    }

    /**
     * Replays what was missed offline.
     * @param limit This timer's resolved `restoredTicksLimit`, its own beating its kind's.
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
