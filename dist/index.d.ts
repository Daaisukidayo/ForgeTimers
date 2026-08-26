import { ForgeClient, ForgeExtension } from "@tryforge/forgescript";
import { TimersManager } from "./managers";
import { IIntervalConfig, ITimeoutConfig } from "./types";
export interface IForgeTimersOptions {
    timeoutConfig?: ITimeoutConfig;
    intervalConfig?: IIntervalConfig;
}
export declare class ForgeTimers extends ForgeExtension {
    readonly options: IForgeTimersOptions;
    name: string;
    description: string;
    version: string;
    requireExtensions: string[];
    timersManager: TimersManager;
    ready: Promise<boolean>;
    constructor(options?: IForgeTimersOptions);
    init(client: ForgeClient): void;
}
export * from "./managers";
export * from "./structures";
export * from "./types";
export * from "./functions/snapshotVars";
//# sourceMappingURL=index.d.ts.map