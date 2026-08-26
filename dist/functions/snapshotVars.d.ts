import { ILocalFunctionData } from "@tryforge/forgescript";
export interface IPersistedLocalFunction {
    code: string;
    args: string[];
}
export interface IPersistedVars {
    keywords?: Record<string, unknown>;
    environment?: Record<string, unknown>;
    localFunctions?: Record<string, IPersistedLocalFunction>;
}
export declare function snapshotVars(runtime: {
    keywords?: Record<string, unknown>;
    environment?: Record<string, unknown>;
    localFunctions?: Record<string, ILocalFunctionData>;
}, label: string): IPersistedVars;
/** Rebuilds `localFunctions` by recompiling each stored code. */
export declare function rehydrateLocalFunctions(stored: Record<string, IPersistedLocalFunction> | undefined, path: string | null | undefined, label: string): Record<string, ILocalFunctionData>;
//# sourceMappingURL=snapshotVars.d.ts.map