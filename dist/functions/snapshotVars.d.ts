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
/** v0 was plain json. v1 tags dates, maps, sets, regexps and bigints, and drops per value instead of per key */
export declare const VARS_SCHEMA_VERSION = 1;
export declare function snapshotVars(runtime: {
    keywords?: Record<string, unknown>;
    environment?: Record<string, unknown>;
    localFunctions?: Record<string, ILocalFunctionData>;
}, label: string): IPersistedVars;
/**
 * Reads back a record written by {@link snapshotVars}.
 * @param source The stored record.
 * @param version The schema the timer was written under.
 * @returns
 */
export declare function restoreVars(source: Record<string, unknown> | undefined, version: number): Record<string, unknown>;
/** Rebuilds `localFunctions` by recompiling each stored code. */
export declare function rehydrateLocalFunctions(stored: Record<string, IPersistedLocalFunction> | undefined, path: string | null | undefined, label: string): Record<string, ILocalFunctionData>;
//# sourceMappingURL=snapshotVars.d.ts.map