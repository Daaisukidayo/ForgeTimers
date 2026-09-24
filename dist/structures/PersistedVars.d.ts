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
/**
 * Writes a timer's variables down for a restart to hand back.
 * Plain JSON travels, and the tagged dates, maps, sets, regexps and bigints `$js` or an extension may leave.
 * Functions, class instances and discord structures can't survive a restart. They get dropped and named in the log.
 * @param runtime Variables to write down.
 * @param label What to call the timer in that log.
 */
export declare function snapshotVars(runtime: {
    keywords?: Record<string, unknown>;
    environment?: Record<string, unknown>;
    localFunctions?: Record<string, ILocalFunctionData>;
}, label: string): IPersistedVars;
/**
 * Reads back a record written by {@link snapshotVars}.
 * @param source Stored record.
 * @param version Schema it was written under.
 */
export declare function restoreVars(source: Record<string, unknown> | undefined, version: number): Record<string, unknown>;
/**
 * Rebuilds `localFunctions` by recompiling each stored code. One that won't compile is dropped.
 * @param stored Local functions as stored.
 * @param path Command path to compile against.
 * @param label What to call the timer in the log.
 */
export declare function rehydrateLocalFunctions(stored: Record<string, IPersistedLocalFunction> | undefined, path: string | null | undefined, label: string): Record<string, ILocalFunctionData>;
//# sourceMappingURL=PersistedVars.d.ts.map