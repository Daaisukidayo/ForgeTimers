import { Context, ILocalFunctionData } from "@tryforge/forgescript";
/**
 * Builds the runner for a timer that fires more than once.
 *
 * @param ctx The context the timer was scheduled from.
 * @param resolve What to run, given the context built for that run.
 * @returns The cloned runtime the snapshot was taken from, and the runner itself.
 */
export declare function repeatingRunner(ctx: Context, resolve: (tick: Context) => Promise<unknown>): {
    runtime: import("@tryforge/forgescript").IRunnable;
    run: () => Promise<void>;
};
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
 * Writes a timer's variables down so a restart can hand them back.
 * Whatever a function left in them travels - strings, numbers, arrays, plain objects, and the tagged dates, maps, sets, regexps and bigints that `$js` or another extension may have put there.
 * Functions, class instances and live discord structures cannot survive a restart, so they are dropped and named in the log instead.
 *
 * @param runtime The variables to write down.
 * @param label What to call this timer in that log.
 */
export declare function snapshotVars(runtime: {
    keywords?: Record<string, unknown>;
    environment?: Record<string, unknown>;
    localFunctions?: Record<string, ILocalFunctionData>;
}, label: string): IPersistedVars;
/**
 * Reads back a record written by {@link snapshotVars}.
 *
 * @param source The stored record.
 * @param version The schema the timer was written under.
 */
export declare function restoreVars(source: Record<string, unknown> | undefined, version: number): Record<string, unknown>;
/** Rebuilds `localFunctions` by recompiling each stored code. */
export declare function rehydrateLocalFunctions(stored: Record<string, IPersistedLocalFunction> | undefined, path: string | null | undefined, label: string): Record<string, ILocalFunctionData>;
//# sourceMappingURL=snapshotVars.d.ts.map