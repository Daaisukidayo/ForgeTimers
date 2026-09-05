import { ForgeClient, ForgeExtension } from "@tryforge/forgescript";
import { TimersManager } from "./managers";
import { TimerStorage } from "./structures";
import { IIntervalConfig, ITimeoutConfig } from "./types";
export interface IForgeTimersOptions {
    timeoutConfig?: ITimeoutConfig;
    intervalConfig?: IIntervalConfig;
    /**
     * Delete timers whose guild this process can't see on startup. Off by default.
     * That's usually an outage or a sibling shard. Only safe unsharded.
     */
    pruneUnknownGuilds?: boolean;
    /**
     * Which extension keeps the timers: `"forgedb"` (default) or `"quorieldb"`.
     */
    storage?: TimerStorage;
    /**
     * Move stored timers out of this backend and into {@link storage} on startup, once.
     * Both extensions have to be loaded for that boot. Names already taken in the target
     * are left alone.
     */
    migrateFrom?: TimerStorage;
    /**
     * Copy on migration instead of moving. The source keeps its timers, which means the
     * migration runs again on every boot until `migrateFrom` is removed.
     */
    keepSource?: boolean;
}
export declare class ForgeTimers extends ForgeExtension {
    readonly options: IForgeTimersOptions;
    name: string;
    description: string;
    version: string;
    timersManager: TimersManager;
    ready: Promise<boolean>;
    constructor(options?: IForgeTimersOptions);
    init(client: ForgeClient): void;
    private _open;
}
export * from "./managers";
export * from "./structures";
export * from "./types";
export * from "./functions/snapshotVars";
export * from "./functions/migrate";
//# sourceMappingURL=index.d.ts.map