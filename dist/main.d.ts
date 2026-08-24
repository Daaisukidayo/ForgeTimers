import { ForgeClient, ForgeExtension } from "@tryforge/forgescript";
import { IForgeTimersOptions } from "./config";
export * from "./timersStore";
export declare class ForgeTimers extends ForgeExtension {
    name: string;
    description: string;
    version: string;
    private readonly stores;
    private readonly timeoutConfig;
    private readonly intervalConfig;
    constructor(options?: IForgeTimersOptions);
    private restores;
    init(client: ForgeClient): void;
    private restore;
    private owns;
    /** The live timer map ForgeScript keeps for a given kind */
    private timerMapFor;
    private isLive;
    private restoreKind;
    private configFor;
    private assertNever;
    /** Drop a one-shot timer that's too late */
    private restoreTimeout;
    private restoreInterval;
    /**
     * Replays ticks that elapsed while the bot was offline, honouring
     * `restoredTicksLimit`. Whether the interval is young enough to be
     * restored at all is decided by `maxOverdue` before this is reached
     */
    private replayMissed;
    /** Refetches the channel/message a timer was scheduled from */
    private rebuildTarget;
}
//# sourceMappingURL=main.d.ts.map