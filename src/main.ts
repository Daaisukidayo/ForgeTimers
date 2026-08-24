import { version, description } from "../package.json"
import { Events } from "discord.js"
import { join } from "path"
import {
    Compiler,
    Context,
    ForgeClient,
    ForgeExtension,
    Interpreter,
    Logger,
    Sendable,
    IExtendedCompilationResult
} from "@tryforge/forgescript"
import { IPersistedTimer, ITimersStore, TimersStores, TimerKind } from "./timersStore"
import { createSQLiteStores } from "./sqliteStore"
import { rehydrateLocalFunctions } from "./varsSnapshot"
import { IBaseTimerConfig, IForgeTimersOptions, IIntervalConfig, ITimeoutConfig } from "./config"

/** Precomputed scheduling numbers shared by every per-kind restore handler */
interface IRestoreTiming {
    /** ms until the timer is due; negative when it already passed */
    delay: number
    /** How far past due it is, or 0 if still in the future */
    overdueBy: number
    /** Whether `overdueBy` exceeds this kind's configured `maxOverdue` */
    late: boolean
}

export * from "./timersStore"

export class ForgeTimers extends ForgeExtension {
    public name = "ForgeTimers"
    public description = description
    public version = version

    private readonly stores: TimersStores
    private readonly timeoutConfig: ITimeoutConfig
    private readonly intervalConfig: IIntervalConfig

    constructor(options: IForgeTimersOptions = {}) {
        super()
        this.stores = options.stores ?? createSQLiteStores()
        this.timeoutConfig = options.timeoutConfig ?? {}
        this.intervalConfig = options.intervalConfig ?? {}
    }

    private restores(kind: TimerKind) {
        return this.configFor(kind).persist !== false
    }

    public init(client: ForgeClient): void {
        client.timersStores = this.stores

        this.load(join(__dirname, "native"))

        client.once(Events.ClientReady, () => {
            this.restore(client).catch((err) => Logger.error(err))
        })
    }

    private async restore(client: ForgeClient): Promise<void> {
        for (const [kind, store] of this.stores) {
            if (!this.restores(kind)) {
                await store.clear()
                continue
            }

            await this.restoreKind(client, kind, store)
        }
    }

    private async owns(client: ForgeClient, record: IPersistedTimer, store: ITimersStore): Promise<boolean> {
        if (record.guildId) {
            if (client.guilds.cache.has(record.guildId)) return true

            if (client.shard) return false // another shard's problem

            await store.delete(record.id)
            return false
        }

        return !client.shard || client.shard.ids.includes(0)
    }

    /** The live timer map ForgeScript keeps for a given kind */
    private timerMapFor(client: ForgeClient, kind: TimerKind): Map<string, NodeJS.Timeout> | undefined {
        switch (kind) {
            case TimerKind.Timeout:
                return client.timeouts
            case TimerKind.Interval:
                return client.intervals
            default:
                return undefined
        }
    }

    private isLive(client: ForgeClient, kind: TimerKind, id: string): boolean {
        return !!this.timerMapFor(client, kind)?.has(id)
    }

    private async restoreKind(client: ForgeClient, kind: TimerKind, store: ITimersStore): Promise<void> {
        const records = await store.load()

        const dueNow: Array<() => Promise<void>> = []

        for (const record of records) {
            if (this.isLive(client, kind, record.id)) {
                Logger.warn(`${this.name} | Skipping ${kind} "${record.id}": already rescheduled since startup`)
                continue
            }

            if (!(await this.owns(client, record, store))) continue

            const obj = await this.rebuildTarget(client, record)
            if (!obj) {
                await store.delete(record.id)
                continue
            }

            let compiled: IExtendedCompilationResult
            try {
                compiled = Compiler.compile(record.code, record.path)
            } catch (err) {
                Logger.error(err)
                await store.delete(record.id)
                continue
            }

            const run = async () => {
                const ctx = new Context({
                    client,
                    command: null,
                    data: compiled,
                    obj,
                    doNotSend: true,
                    redirectErrorsToConsole: true,
                    keywords: { ...record.vars?.keywords },
                    environment: { ...record.vars?.environment },
                    localFunctions: rehydrateLocalFunctions(
                        record.vars?.localFunctions,
                        record.path,
                        this.name
                    ),
                })
                await Interpreter.run(ctx).catch((err) => Logger.error(err))
            }

            const delay = record.fireAt - Date.now()
            const overdueBy = delay < 0 ? -delay : 0

            const config = this.configFor(kind)
            const late = !!(overdueBy && config.maxOverdue && overdueBy > config.maxOverdue)
            const timing = { delay, overdueBy, late }

            switch (kind) {
                case TimerKind.Timeout:
                    await this.restoreTimeout(client, record, store, timing, run, dueNow)
                    break

                case TimerKind.Interval:
                    await this.restoreInterval(client, record, store, timing, run, dueNow)
                    break

                default:
                    this.assertNever(kind, record.id)
            }
        }

        await Promise.allSettled(dueNow.map((task) => task()))
    }

    private configFor(kind: TimerKind): IBaseTimerConfig {
        switch (kind) {
            case TimerKind.Timeout:
                return this.timeoutConfig
            case TimerKind.Interval:
                return this.intervalConfig
            default:
                return {}
        }
    }

    private assertNever(kind: never, id: string): void {
        Logger.warn(`${this.name} | Skipping timer "${id}": unsupported kind "${kind}"`)
    }

    /** Drop a one-shot timer that's too late */
    private async restoreTimeout(
        client: ForgeClient,
        record: IPersistedTimer,
        store: ITimersStore,
        timing: IRestoreTiming,
        run: () => Promise<void>,
        dueNow: Array<() => Promise<void>>
    ): Promise<void> {
        if (timing.late) {
            Logger.warn(
                `${this.name} | Discarding timeout "${record.id}": overdue by ${timing.overdueBy}ms (max ${this.timeoutConfig.maxOverdue}ms)`
            )
            await store.delete(record.id)
            return
        }

        const fire = async () => {
            await run()
            client.timeouts.delete(record.id)
            await store.delete(record.id)
        }

        if (this.isLive(client, record.kind, record.id)) return

        if (timing.delay <= 0) {
            dueNow.push(async () => {
                if (this.isLive(client, record.kind, record.id)) return
                await fire()
            })
        } else client.timeouts.set(record.id, setTimeout(fire, timing.delay))
    }

    private async restoreInterval(
        client: ForgeClient,
        record: IPersistedTimer,
        store: ITimersStore,
        timing: IRestoreTiming,
        run: () => Promise<void>,
        dueNow: Array<() => Promise<void>>
    ): Promise<void> {
        const resume = () => {
            if (this.isLive(client, record.kind, record.id)) return

            const timer = setInterval(async () => {
                await run()
                await store.save({ ...record, fireAt: Date.now() + record.interval! })
            }, record.interval)
            client.intervals.set(record.id, timer)
        }

        // only the stale tick is dropped
        if (timing.late) {
            if (this.isLive(client, record.kind, record.id)) return

            Logger.warn(
                `${this.name} | Interval "${record.id}": skipping tick overdue by ${timing.overdueBy}ms (max ${this.intervalConfig.maxOverdue}ms), resuming schedule`
            )
            await store.save({ ...record, fireAt: Date.now() + record.interval! })
            resume()
            return
        }

        if (timing.delay <= 0) {
            dueNow.push(async () => {
                if (this.isLive(client, record.kind, record.id)) return
                await this.replayMissed(record, timing.overdueBy, run)
                await store.save({ ...record, fireAt: Date.now() + record.interval! })
            })
            resume()
            return
        }

        // bridge the partial tick with a one-shot timeout, then hand over to the steady interval
        if (this.isLive(client, record.kind, record.id)) return

        const bridge = setTimeout(async () => {
            await run()
            await store.save({ ...record, fireAt: Date.now() + record.interval! })
            resume()
        }, timing.delay)
        client.intervals.set(record.id, bridge)
    }

    /**
     * Replays ticks that elapsed while the bot was offline, honouring
     * `restoredTicksLimit`. Whether the interval is young enough to be
     * restored at all is decided by `maxOverdue` before this is reached
     */
    private async replayMissed(record: IPersistedTimer, overdueBy: number, run: () => Promise<void>) {
        const limit = this.intervalConfig.restoredTicksLimit
        if (!limit) return

        const every = record.interval || 0
        // fireAt is the tick we were already waiting on, so it counts as one
        const missed = every > 0 ? Math.floor(overdueBy / every) + 1 : 1
        const toRun = limit < 0 ? missed : Math.min(missed, limit)

        if (missed > toRun) {
            Logger.warn(`${this.name} | Interval "${record.id}": replaying ${toRun} of ${missed} missed ticks.`)
        }

        for (let i = 0; i < toRun; i++) {
            await run()
        }
    }

    /** Refetches the channel/message a timer was scheduled from */
    private async rebuildTarget(client: ForgeClient, record: IPersistedTimer): Promise<Sendable | null> {
        const channel = await client.channels.fetch(record.channelId).catch(() => null)
        if (!channel) return null

        if (record.messageId && "messages" in channel) {
            const message = await channel.messages.fetch(record.messageId).catch(() => null)
            if (message) return message as Sendable
        }

        return channel as Sendable
    }
}