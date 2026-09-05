import { Compiler, ForgeClient, Interpreter, Sendable } from "@tryforge/forgescript"
import { DiscordAPIError, GuildMember, User } from "discord.js"
import { Database, Timer, TimerContext, TimerKind } from "../structures"
import { ForgeTimers } from ".."
import { IBaseTimerConfig } from "../types"
import { rehydrateLocalFunctions, restoreVars } from "../functions/snapshotVars"
import { setLongTimeout } from "../functions/schedule"
import { Logger } from "../functions/logger"

/** Shared by every per-kind restore handler */
interface IRestoreTiming {
    config: IBaseTimerConfig
    /** How far past due the timer is, or 0 if it isn't yet. */
    overdueBy: number
    /** Whether `overdueBy` exceeds this kind's configured `maxOverdue`. */
    late: boolean
}

/** `gone` means the target is really destroyed — drop it. Anything else waits for the next boot */
interface IRestoreFailure {
    ok: false
    gone: boolean
    reason: string
}

/** A run blocked by an outage isn't a run — the record is only spent when `ran` or `gone` */
interface IRunOutcome {
    ran: boolean
    gone: boolean
}

type Runner = () => Promise<IRunOutcome>

type IRunnerResult = { ok: true; run: Runner } | IRestoreFailure
type ITargetResult = { ok: true; obj: Sendable } | IRestoreFailure

/** Really gone, as opposed to a rate limit or an outage — only this may cost a timer */
function isGone(err: unknown) {
    return err instanceof DiscordAPIError && err.status === 404
}

function reasonOf(err: unknown) {
    return err instanceof Error ? err.message : String(err)
}

export class TimersManager {
    private readonly timers: ForgeTimers

    /** Bumped on every arm and every clear, so a callback can tell it was superseded */
    private readonly generations = new Map<string, number>()

    public constructor(private readonly client: ForgeClient) {
        this.timers = client.getExtension(ForgeTimers, true)

        client.once("clientReady", async () => {
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
            return { ran: true, gone: false }
        })

        return timer
    }

    /**
     * Cancels a running timer, leaving the database untouched.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     */
    public clear(kind: TimerKind, name: string) {
        const map = this.mapOf(kind)
        const handle = map?.get(name)
        if (!map || !handle) return false

        if (kind === TimerKind.interval) clearInterval(handle)
        else clearTimeout(handle)

        map.delete(name)
        this._claim(kind, name)
        return true
    }

    private _save(timer: Timer) {
        return Database.set(timer).catch(Logger.error)
    }

    private _forget(timer: Timer) {
        return Database.delete(timer.kind, timer.name).catch(Logger.error)
    }

    /** Takes the name over and hands back a check for whether it's still ours */
    private _claim(kind: TimerKind, name: string) {
        const key = Timer.idOf(kind, name)
        const generation = (this.generations.get(key) ?? 0) + 1

        this.generations.set(key, generation)
        return () => this.generations.get(key) === generation
    }

    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns Whether it was running, and whether a stored record was removed.
     */
    public async stop(kind: TimerKind, name: string): Promise<[boolean, boolean]> {
        const cleared = this.clear(kind, name)
        if (!(await this.timers.ready)) return [cleared, false]

        const result = await Database.delete(kind, name).catch(Logger.error)
        return [cleared, !!result && (result.affected ?? 0) > 0]
    }

    /**
     * Cancels every stored timer and empties the table.
     * @returns The number of running timers that were cancelled.
     */
    public async wipe() {
        if (!(await this.timers.ready)) return 0

        const stored = await Database.getAll().catch(Logger.error)
        let cleared = 0

        for (const timer of stored ?? []) {
            if (this.clear(timer.kind, timer.name)) cleared++
        }

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
        return !!this.mapOf(kind)?.has(name)
    }

    private configOf(kind: TimerKind): IBaseTimerConfig {
        const { timeoutConfig, intervalConfig } = this.timers.options

        switch (kind) {
            case TimerKind.timeout:
                return timeoutConfig ?? {}
            case TimerKind.interval:
                return intervalConfig ?? {}
            default:
                return {}
        }
    }

    /** Arms `fn`, keeping the live map on the pending chunk so {@link clear} cancels the right one */
    private _schedule(kind: TimerKind, name: string, delay: number, fn: () => void) {
        const map = this.mapOf(kind)
        setLongTimeout(delay, fn, (handle) => map?.set(name, handle))
    }

    private _arm(timer: Timer, run: Runner) {
        const owns = this._claim(timer.kind, timer.name)

        switch (timer.kind) {
            case TimerKind.interval:
                return this._armInterval(timer, run, owns)

            case TimerKind.timeout:
                return this._armTimeout(timer, run, owns)

            default:
                return this._assertNever(timer.kind, timer.name)
        }
    }

    private _armTimeout(timer: Timer, run: Runner, owns: () => boolean) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            const outcome = await run()

            // someone took the name while we ran, their handle and row aren't ours to drop
            if (!owns()) return

            this.client.timeouts.delete(timer.name)

            // don't burn the record on an outage, retry it next boot
            if (outcome.ran || outcome.gone) await this._forget(timer)
        })
    }

    /** Self-arming rather than `setInterval`: handles ticks past node's cap, and resumes on time left */
    private _armInterval(timer: Timer, run: Runner, owns: () => boolean) {
        this._schedule(timer.kind, timer.name, timer.timeLeft(), async () => {
            if (!owns()) return

            // bump first: a slow run mustn't drag the phase, a crash mustn't look pending
            await this._save(timer.advance())

            if (!owns()) {
                // cancelled while that write was in flight, so take the row back out
                if (!this.isLive(timer.kind, timer.name)) await this._forget(timer)
                return
            }

            this._armInterval(timer, run, owns)

            const outcome = await run()
            if (outcome.gone && owns()) {
                Logger.warn(`Stopping interval "${timer.name}": its target is gone`)
                this.clear(timer.kind, timer.name)
                await this._forget(timer)
            }
        })
    }

    /**
     * Compiles now, fetches later. Boot stays free of requests, and a distant timer isn't
     * thrown away over an outage happening today.
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

        let resolved: { obj: Sendable; host: User | null; hostMember: GuildMember | null } | null = null

        const run: Runner = async () => {
            if (!resolved) {
                const target = await this._rebuildTarget(timer)
                if (!target.ok) {
                    Logger.warn(
                        target.gone
                            ? `${timer.kind} "${timer.name}" has nowhere to run: ${target.reason}`
                            : `Could not run ${timer.kind} "${timer.name}" yet: ${target.reason}`
                    )
                    return { ran: false, gone: target.gone }
                }

                const obj = target.obj
                const hasAuthor = "author" in obj || "user" in obj
                const host = timer.hostID && !hasAuthor
                    ? await this.client.users.fetch(timer.hostID).catch(() => null)
                    : null

                const guild = timer.guildID ? this.client.guilds.cache.get(timer.guildID) : undefined
                const hostMember = host && guild ? await guild.members.fetch(host.id).catch(() => null) : null

                resolved = { obj, host, hostMember }
            }

            const ctx = new TimerContext({
                client: this.client,
                command: this._commandFor(timer),
                data: compiled,
                obj: resolved.obj,
                doNotSend: true,
                redirectErrorsToConsole: true,
                keywords: { ...keywords },
                environment: { ...environment },
                localFunctions: rehydrateLocalFunctions(timer.vars?.localFunctions, timer.path, "ForgeTimers"),
                args: timer.args ?? [],
                host: resolved.host,
                hostMember: resolved.hostMember,
            })

            await Interpreter.run(ctx).catch(Logger.error)
            return { ran: true, gone: false }
        }

        return { ok: true, run }
    }

    /**
     * Finds the live command again, so a restored run reads the same `$commandName`.
     * @param timer The timer to look up.
     */
    private _commandFor(timer: Timer) {
        if (!timer.path && !timer.commandName) return null

        const commands = this.client.commands?.toArray() ?? []
        const found = commands.find(
            (command) =>
                (timer.path && command.data.path === timer.path) ||
                (timer.commandName && command.data.name === timer.commandName)
        )

        return found ?? null
    }

    private async _rebuildTarget(timer: Timer): Promise<ITargetResult> {
        // no channel means empty target
        if (!timer.channelID) return { ok: true, obj: {} }

        let channel
        try {
            channel = await this.client.channels.fetch(timer.channelID)
        } catch (err) {
            return {
                ok: false,
                gone: isGone(err),
                reason: `channel ${timer.channelID} could not be fetched: ${reasonOf(err)}`,
            }
        }

        if (!channel) {
            return { ok: false, gone: true, reason: `channel ${timer.channelID} no longer exists` }
        }

        // refills the author from hostID
        if (timer.messageID && "messages" in channel) {
            const message = await channel.messages.fetch(timer.messageID).catch(() => null)
            if (message) return { ok: true, obj: message as Sendable }
        }

        return { ok: true, obj: channel as Sendable }
    }

    /** What we can't see is left alone — it's a sibling shard or an outage. Deleting is opt-in */
    private async _owns(timer: Timer) {
        if (!timer.guildID) {
            // no guild means shard 0, otherwise sharding would run it twice
            return !this.client.shard || this.client.shard.ids.includes(0)
        }

        if (this.client.guilds.cache.has(timer.guildID)) return true

        if (!this.client.shard && this.timers.options.pruneUnknownGuilds) {
            Logger.warn(
                `Dropping ${timer.kind} "${timer.name}": guild ${timer.guildID} is not visible to this process`
            )
            await this._forget(timer)
        }

        return false
    }

    private async _restore() {
        if (!(await this.timers.ready)) return

        const timers = await Database.getAll().catch(Logger.error)
        if (!timers) return

        const dueNow: Array<() => Promise<void>> = []

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

            const config = this.configOf(timer.kind)
            if (config.persist === false) {
                await this._forget(timer)
                continue
            }

            const runner = this._runnerFor(timer)
            if (!runner.ok) {
                if (runner.gone) {
                    Logger.warn(`Dropping ${timer.kind} "${timer.name}": ${runner.reason}`)
                    await this._forget(timer)
                } else {
                    Logger.warn(
                        `Keeping ${timer.kind} "${timer.name}" for the next boot: ${runner.reason}`
                    )
                }
                continue
            }

            const run = runner.run
            const overdueBy = timer.overdueBy()
            const late = !!(overdueBy && config.maxOverdue && overdueBy > config.maxOverdue)

            switch (timer.kind) {
                case TimerKind.timeout:
                    await this._restoreTimeout(timer, { config, overdueBy, late }, run, dueNow)
                    break

                case TimerKind.interval:
                    await this._restoreInterval(timer, { config, overdueBy, late }, run, dueNow)
                    break

                default:
                    this._assertNever(timer.kind, timer.name)
            }
        }

        await Promise.allSettled(dueNow.map((task) => task()))
    }

    /** Drops a one-shot that's too late, otherwise fires or re-arms it */
    private async _restoreTimeout(
        timer: Timer,
        timing: IRestoreTiming,
        run: Runner,
        dueNow: Array<() => Promise<void>>
    ) {
        if (timing.late) {
            Logger.warn(
                `Discarding timeout "${timer.name}": overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms)`
            )
            await this._forget(timer)
            return
        }

        if (!timer.isOverdue()) return this._arm(timer, run)

        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name)) return

            const owns = this._claim(timer.kind, timer.name)
            const outcome = await run()

            if (!owns()) return
            if (outcome.ran || outcome.gone) await this._forget(timer)
        })
    }

    private async _restoreInterval(
        timer: Timer,
        timing: IRestoreTiming,
        run: Runner,
        dueNow: Array<() => Promise<void>>
    ) {
        if (timing.late) {
            Logger.warn(
                `Interval "${timer.name}": skipping tick overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms), resuming schedule`
            )
            await this._save(timer.scheduleNext())
            return this._arm(timer, run)
        }

        // still on schedule, _arm picks up the time left on this tick
        if (!timer.isOverdue()) return this._arm(timer, run)

        const missed = timer.missedTicks()

        // arm inside the task, isLive would go true first and eat every replay
        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name)) return
            await this._replay(timer, missed, run)

            // a script may have rescheduled this name while the replay was running
            if (this.isLive(timer.kind, timer.name)) return

            await this._save(timer.scheduleNext())
            this._arm(timer, run)
        })
    }

    private _assertNever(kind: never, name: string): void {
        Logger.warn(`Skipping timer "${name}": unsupported kind "${kind}"`)
    }

    /** Replays what was missed offline, up to `restoredTicksLimit` */
    private async _replay(timer: Timer, missed: number, run: Runner) {
        const limit = this.timers.options.intervalConfig?.restoredTicksLimit
        if (!limit) return

        const toRun = limit < 0 ? missed : Math.min(missed, limit)
        if (toRun <= 0) return

        Logger.warn(
            missed > toRun
                ? `Interval "${timer.name}": replaying ${toRun} of ${missed} missed ticks.`
                : `Interval "${timer.name}": replaying ${toRun} missed tick(s).`
        )

        for (let i = 0; i < toRun; i++) {
            // no point replaying into a target we can't reach
            const outcome = await run()
            if (!outcome.ran) return
        }
    }
}