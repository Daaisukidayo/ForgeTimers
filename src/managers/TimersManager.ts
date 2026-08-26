import { Compiler, ForgeClient, Interpreter, Logger, Sendable } from "@tryforge/forgescript"
import { Database, Timer, TimerContext, TimerKind } from "../structures"
import { ForgeTimers } from ".."
import { IBaseTimerConfig } from "../types"
import { rehydrateLocalFunctions } from "../functions/snapshotVars"
import noop from "../functions/noop"

/** Precomputed numbers shared by every per-kind restore handler. */
interface IRestoreTiming {
    config: IBaseTimerConfig
    /** How far past due the timer is, or 0 if it isn't yet. */
    overdueBy: number
    /** Whether `overdueBy` exceeds this kind's configured `maxOverdue`. */
    late: boolean
}

export class TimersManager {
    private readonly timers: ForgeTimers

    public constructor(private readonly client: ForgeClient) {
        this.timers = client.getExtension(ForgeTimers, true)

        client.once("clientReady", async () => {
            if (!(await this.timers.ready)) return
            await this._restore()
        })
    }

    /**
     * Schedules a timer and persists it.
     * @param options The timer to schedule.
     * @returns
     */
    public async start(timer: Timer, run: () => Promise<void>) {
        const persisted = await this.timers.ready

        if (this.clear(timer.kind, timer.name)) {
            Logger.warn(`[ForgeTimers] Replacing existing ${timer.kind} "${timer.name}"`)
        }

        if (persisted) await Database.set(timer).catch(noop)
        this._arm(timer, run)

        return timer
    }

    /**
     * Cancels a running timer, leaving the database untouched.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    public clear(kind: TimerKind, name: string) {
        const map = this.mapOf(kind)
        const handle = map?.get(name)
        if (!map || !handle) return false

        if (kind === TimerKind.interval) clearInterval(handle)
        else clearTimeout(handle)

        map.delete(name)
        return true
    }

    /**
     * Cancels a running timer and deletes it from the database.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
     */
    public async stop(kind: TimerKind, name: string) {
        const persisted = await this.timers.ready
        const cleared = this.clear(kind, name)
        if (persisted) await Database.delete(kind, name).catch(noop)
        return cleared
    }

    /**
     * Cancels every stored timer and empties the table.
     * @returns The number of running timers that were cancelled.
     */
    public async wipe() {
        if (!(await this.timers.ready)) return 0

        const stored = await Database.getAll().catch(noop)
        let cleared = 0

        for (const timer of stored ?? []) {
            if (this.clear(timer.kind, timer.name)) cleared++
        }

        await Database.wipe().catch(noop)
        return cleared
    }

    /**
     * The live timer map ForgeScript keeps for a kind.
     * @param kind The kind of the timers.
     * @returns
     */
    public mapOf(kind: TimerKind) {
        switch (kind) {
            case TimerKind.timeout:
                return this.client.timeouts
            case TimerKind.interval:
                return this.client.intervals
            default:
                // a kind with no map of its own isn't schedulable here yet
                return undefined
        }
    }

    /**
     * Whether a timer under this name is already running.
     * @param kind The kind of the timer.
     * @param name The name of the timer.
     * @returns
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

    private _arm(timer: Timer, run: () => Promise<void>) {
        switch (timer.kind) {
            case TimerKind.interval: {
                const handle = setInterval(async () => {
                    await run()
                    await Database.set(timer.scheduleNext()).catch(noop)
                }, timer.duration || undefined)

                this.client.intervals.set(timer.name, handle)
                return
            }

            case TimerKind.timeout:
                break

            default:
                return this._assertNever(timer.kind, timer.name)
        }

        const handle = setTimeout(async () => {
            await run()
            this.client.timeouts.delete(timer.name)
            await Database.delete(timer.kind, timer.name).catch(noop)
        }, timer.timeLeft() || undefined)

        this.client.timeouts.set(timer.name, handle)
    }

    /**
     * Rebuilds a runner for a stored timer, recompiling its code and
     * refetching the channel or message it was scheduled from.
     * @param timer The timer to build a runner for.
     * @returns
     */
    private async _runnerFor(timer: Timer) {
        const obj = await this._rebuildTarget(timer)
        if (!obj) return null

        let compiled
        try {
            compiled = Compiler.compile(timer.code, timer.path)
        } catch (err) {
            noop(err)
            return null
        }

        const hasAuthor = "author" in obj || "user" in obj
        const host = timer.hostID && !hasAuthor
            ? await this.client.users.fetch(timer.hostID).catch(() => null)
            : null

        const guild = timer.guildID ? this.client.guilds.cache.get(timer.guildID) : undefined
        const hostMember = host && guild ? await guild.members.fetch(host.id).catch(() => null) : null

        return async () => {
            const ctx = new TimerContext({
                client: this.client,
                command: null,
                data: compiled,
                obj,
                doNotSend: true,
                redirectErrorsToConsole: true,
                keywords: { ...timer.vars?.keywords },
                environment: { ...timer.vars?.environment },
                localFunctions: rehydrateLocalFunctions(timer.vars?.localFunctions, timer.path, "ForgeTimers"),
                args: timer.args ?? [],
                host,
                hostMember,
            })

            await Interpreter.run(ctx).catch(noop)
        }
    }

    private async _rebuildTarget(timer: Timer): Promise<Sendable | null> {
        const channel = await this.client.channels.fetch(timer.channelID).catch(() => null)
        if (!channel) return null

        if (timer.messageID && "messages" in channel) {
            const message = await channel.messages.fetch(timer.messageID).catch(() => null)
            if (message) return message as Sendable
        }

        return channel as Sendable
    }

    /**
     * Whether this process should restore a given timer.
     */
    private async _owns(timer: Timer) {
        if (timer.guildID) {
            if (this.client.guilds.cache.has(timer.guildID)) return true
            if (this.client.shard) return false

            await Database.delete(timer.kind, timer.name).catch(noop)
            return false
        }

        // DM timer
        return !this.client.shard || this.client.shard.ids.includes(0)
    }

    private async _restore() {
        if (!(await this.timers.ready)) return

        const timers = await Database.getAll().catch(noop)
        if (!timers) return

        const dueNow: Array<() => Promise<void>> = []

        for (const timer of timers) {
            if (this.isLive(timer.kind, timer.name)) {
                Logger.warn(`[ForgeTimers] Skipping ${timer.kind} "${timer.name}": already rescheduled since startup`)
                continue
            }

            if (!(await this._owns(timer))) continue

            const config = this.configOf(timer.kind)
            if (config.persist === false) {
                await Database.delete(timer.kind, timer.name).catch(noop)
                continue
            }

            const run = await this._runnerFor(timer)
            if (!run) {
                await Database.delete(timer.kind, timer.name).catch(noop)
                continue
            }

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

    /** Drops a one-shot timer that's too late, otherwise fires or re-arms it. */
    private async _restoreTimeout(
        timer: Timer,
        timing: IRestoreTiming,
        run: () => Promise<void>,
        dueNow: Array<() => Promise<void>>
    ) {
        if (timing.late) {
            Logger.warn(
                `[ForgeTimers] Discarding timeout "${timer.name}": overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms)`
            )
            await Database.delete(timer.kind, timer.name).catch(noop)
            return
        }

        if (!timer.isOverdue()) return this._arm(timer, run)

        dueNow.push(async () => {
            if (this.isLive(timer.kind, timer.name)) return
            await run()
            await Database.delete(timer.kind, timer.name).catch(noop)
        })
    }


    private async _restoreInterval(
        timer: Timer,
        timing: IRestoreTiming,
        run: () => Promise<void>,
        dueNow: Array<() => Promise<void>>
    ) {
        if (timing.late) {
            Logger.warn(
                `[ForgeTimers] Interval "${timer.name}": skipping tick overdue by ${timing.overdueBy}ms (max ${timing.config.maxOverdue}ms), resuming schedule`
            )
            await Database.set(timer.scheduleNext()).catch(noop)
            return this._arm(timer, run)
        }

        if (timer.isOverdue()) {
            const missed = timer.missedTicks()
            dueNow.push(async () => {
                if (this.isLive(timer.kind, timer.name)) return
                await this._replay(timer, missed, run)
                await Database.set(timer.scheduleNext()).catch(noop)
            })
        }

        this._arm(timer, run)
    }

    private _assertNever(kind: never, name: string): void {
        Logger.warn(`[ForgeTimers] Skipping timer "${name}": unsupported kind "${kind}"`)
    }

    /**
     * Replays ticks that elapsed while the app was offline, honouring `restoredTicksLimit`.
     */
    private async _replay(timer: Timer, missed: number, run: () => Promise<void>) {
        const limit = this.timers.options.intervalConfig?.restoredTicksLimit
        if (!limit) return

        const toRun = limit < 0 ? missed : Math.min(missed, limit)
        if (toRun <= 0) return

        Logger.warn(
            missed > toRun
                ? `[ForgeTimers] Interval "${timer.name}": replaying ${toRun} of ${missed} missed ticks.`
                : `[ForgeTimers] Interval "${timer.name}": replaying ${toRun} missed tick(s).`
        )

        for (let i = 0; i < toRun; i++) await run()
    }
}