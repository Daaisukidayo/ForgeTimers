"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ForgeTimers = void 0;
const package_json_1 = require("../package.json");
const discord_js_1 = require("discord.js");
const path_1 = require("path");
const forgescript_1 = require("@tryforge/forgescript");
const timersStore_1 = require("./timersStore");
const sqliteStore_1 = require("./sqliteStore");
const varsSnapshot_1 = require("./varsSnapshot");
__exportStar(require("./timersStore"), exports);
class ForgeTimers extends forgescript_1.ForgeExtension {
    name = "ForgeTimers";
    description = package_json_1.description;
    version = package_json_1.version;
    stores;
    timeoutConfig;
    intervalConfig;
    constructor(options = {}) {
        super();
        this.stores = options.stores ?? (0, sqliteStore_1.createSQLiteStores)();
        this.timeoutConfig = options.timeoutConfig ?? {};
        this.intervalConfig = options.intervalConfig ?? {};
    }
    restores(kind) {
        return this.configFor(kind).persist !== false;
    }
    init(client) {
        client.timersStores = this.stores;
        this.load((0, path_1.join)(__dirname, "native"));
        client.once(discord_js_1.Events.ClientReady, () => {
            this.restore(client).catch((err) => forgescript_1.Logger.error(err));
        });
    }
    async restore(client) {
        for (const [kind, store] of this.stores) {
            if (!this.restores(kind)) {
                await store.clear();
                continue;
            }
            await this.restoreKind(client, kind, store);
        }
    }
    async owns(client, record, store) {
        if (record.guildId) {
            if (client.guilds.cache.has(record.guildId))
                return true;
            if (client.shard)
                return false; // another shard's problem
            await store.delete(record.id);
            return false;
        }
        return !client.shard || client.shard.ids.includes(0);
    }
    /** The live timer map ForgeScript keeps for a given kind */
    timerMapFor(client, kind) {
        switch (kind) {
            case timersStore_1.TimerKind.Timeout:
                return client.timeouts;
            case timersStore_1.TimerKind.Interval:
                return client.intervals;
            default:
                return undefined;
        }
    }
    isLive(client, kind, id) {
        return !!this.timerMapFor(client, kind)?.has(id);
    }
    async restoreKind(client, kind, store) {
        const records = await store.load();
        const dueNow = [];
        for (const record of records) {
            if (this.isLive(client, kind, record.id)) {
                forgescript_1.Logger.warn(`${this.name} | Skipping ${kind} "${record.id}": already rescheduled since startup`);
                continue;
            }
            if (!(await this.owns(client, record, store)))
                continue;
            const obj = await this.rebuildTarget(client, record);
            if (!obj) {
                await store.delete(record.id);
                continue;
            }
            let compiled;
            try {
                compiled = forgescript_1.Compiler.compile(record.code, record.path);
            }
            catch (err) {
                forgescript_1.Logger.error(err);
                await store.delete(record.id);
                continue;
            }
            const run = async () => {
                const ctx = new forgescript_1.Context({
                    client,
                    command: null,
                    data: compiled,
                    obj,
                    doNotSend: true,
                    redirectErrorsToConsole: true,
                    keywords: { ...record.vars?.keywords },
                    environment: { ...record.vars?.environment },
                    localFunctions: (0, varsSnapshot_1.rehydrateLocalFunctions)(record.vars?.localFunctions, record.path, this.name),
                });
                await forgescript_1.Interpreter.run(ctx).catch((err) => forgescript_1.Logger.error(err));
            };
            const delay = record.fireAt - Date.now();
            const overdueBy = delay < 0 ? -delay : 0;
            const config = this.configFor(kind);
            const late = !!(overdueBy && config.maxOverdue && overdueBy > config.maxOverdue);
            const timing = { delay, overdueBy, late };
            switch (kind) {
                case timersStore_1.TimerKind.Timeout:
                    await this.restoreTimeout(client, record, store, timing, run, dueNow);
                    break;
                case timersStore_1.TimerKind.Interval:
                    await this.restoreInterval(client, record, store, timing, run, dueNow);
                    break;
                default:
                    this.assertNever(kind, record.id);
            }
        }
        await Promise.allSettled(dueNow.map((task) => task()));
    }
    configFor(kind) {
        switch (kind) {
            case timersStore_1.TimerKind.Timeout:
                return this.timeoutConfig;
            case timersStore_1.TimerKind.Interval:
                return this.intervalConfig;
            default:
                return {};
        }
    }
    assertNever(kind, id) {
        forgescript_1.Logger.warn(`${this.name} | Skipping timer "${id}": unsupported kind "${kind}"`);
    }
    /** Drop a one-shot timer that's too late */
    async restoreTimeout(client, record, store, timing, run, dueNow) {
        if (timing.late) {
            forgescript_1.Logger.warn(`${this.name} | Discarding timeout "${record.id}": overdue by ${timing.overdueBy}ms (max ${this.timeoutConfig.maxOverdue}ms)`);
            await store.delete(record.id);
            return;
        }
        const fire = async () => {
            await run();
            client.timeouts.delete(record.id);
            await store.delete(record.id);
        };
        if (this.isLive(client, record.kind, record.id))
            return;
        if (timing.delay <= 0) {
            dueNow.push(async () => {
                if (this.isLive(client, record.kind, record.id))
                    return;
                await fire();
            });
        }
        else
            client.timeouts.set(record.id, setTimeout(fire, timing.delay));
    }
    async restoreInterval(client, record, store, timing, run, dueNow) {
        const resume = () => {
            if (this.isLive(client, record.kind, record.id))
                return;
            const timer = setInterval(async () => {
                await run();
                await store.save({ ...record, fireAt: Date.now() + record.interval });
            }, record.interval);
            client.intervals.set(record.id, timer);
        };
        // only the stale tick is dropped
        if (timing.late) {
            if (this.isLive(client, record.kind, record.id))
                return;
            forgescript_1.Logger.warn(`${this.name} | Interval "${record.id}": skipping tick overdue by ${timing.overdueBy}ms (max ${this.intervalConfig.maxOverdue}ms), resuming schedule`);
            await store.save({ ...record, fireAt: Date.now() + record.interval });
            resume();
            return;
        }
        if (timing.delay <= 0) {
            dueNow.push(async () => {
                if (this.isLive(client, record.kind, record.id))
                    return;
                await this.replayMissed(record, timing.overdueBy, run);
                await store.save({ ...record, fireAt: Date.now() + record.interval });
            });
            resume();
            return;
        }
        // bridge the partial tick with a one-shot timeout, then hand over to the steady interval
        if (this.isLive(client, record.kind, record.id))
            return;
        const bridge = setTimeout(async () => {
            await run();
            await store.save({ ...record, fireAt: Date.now() + record.interval });
            resume();
        }, timing.delay);
        client.intervals.set(record.id, bridge);
    }
    /**
     * Replays ticks that elapsed while the bot was offline, honouring
     * `restoredTicksLimit`. Whether the interval is young enough to be
     * restored at all is decided by `maxOverdue` before this is reached
     */
    async replayMissed(record, overdueBy, run) {
        const limit = this.intervalConfig.restoredTicksLimit;
        if (!limit)
            return;
        const every = record.interval || 0;
        // fireAt is the tick we were already waiting on, so it counts as one
        const missed = every > 0 ? Math.floor(overdueBy / every) + 1 : 1;
        const toRun = limit < 0 ? missed : Math.min(missed, limit);
        if (missed > toRun) {
            forgescript_1.Logger.warn(`${this.name} | Interval "${record.id}": replaying ${toRun} of ${missed} missed ticks.`);
        }
        for (let i = 0; i < toRun; i++) {
            await run();
        }
    }
    /** Refetches the channel/message a timer was scheduled from */
    async rebuildTarget(client, record) {
        const channel = await client.channels.fetch(record.channelId).catch(() => null);
        if (!channel)
            return null;
        if (record.messageId && "messages" in channel) {
            const message = await channel.messages.fetch(record.messageId).catch(() => null);
            if (message)
                return message;
        }
        return channel;
    }
}
exports.ForgeTimers = ForgeTimers;
//# sourceMappingURL=main.js.map