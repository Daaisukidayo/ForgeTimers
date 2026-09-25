import { ForgeClient, ForgeExtension } from "@tryforge/forgescript";
import { EventEmitter } from "node:events";
import { TimerCommandManager, TimersManager } from "./managers";
import { TimerKind } from "./structures";
import { IForgeTimersOptions, ITimerEvents, ITimerOverrides } from "./types";
declare module "@tryforge/forgescript" {
    interface ForgeClient {
        crons: Map<string, NodeJS.Timeout>;
    }
}
export declare class ForgeTimers extends ForgeExtension {
    readonly options: IForgeTimersOptions;
    name: string;
    description: string;
    version: string;
    timersManager: TimersManager;
    commands: TimerCommandManager;
    readonly emitter: EventEmitter<ITimerEvents>;
    ready: Promise<boolean>;
    constructor(options?: IForgeTimersOptions);
    /**
     * The extension on a client. Throws when it isn't loaded.
     * @param client Client to look on.
     */
    static of(client: ForgeClient): ForgeTimers;
    /**
     * Config of a kind, `{}` when none was given.
     * @param kind Timer kind.
     */
    configOf(kind: TimerKind): ITimerOverrides;
    init(client: ForgeClient): void;
    private _open;
    private _reviewOptions;
}
export * from "./managers";
export * from "./structures";
export * from "./types";
//# sourceMappingURL=index.d.ts.map