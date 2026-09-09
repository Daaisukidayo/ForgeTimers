import { ForgeClient, ForgeExtension } from "@tryforge/forgescript";
import { EventEmitter } from "node:events";
import { TimerCommandManager, TimersManager } from "./managers";
import { IForgeTimersOptions, ITimerEvents } from "./types";
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
    init(client: ForgeClient): void;
    private _open;
}
export * from "./managers";
export * from "./structures";
export * from "./types";
export * from "./functions/snapshotVars";
export * from "./functions/migrate";
//# sourceMappingURL=index.d.ts.map