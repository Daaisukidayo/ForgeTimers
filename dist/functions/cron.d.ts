/**
 * When an expression next comes round.
 *
 * @param expression The cron expression to read.
 * @param from The moment to look forward from, in unix ms.
 * @param timezone The zone to read it in. Empty or null is whatever the process runs in.
 * @returns The next matching moment, in unix ms.
 */
export declare function nextRun(expression: string, from: number, timezone?: string | null): number;
/**
 * Counts what an expression came round to.
 *
 * @param expression The cron expression to read.
 * @param from The moment it was last due, in unix ms.
 * @param limit How many are worth counting, since nothing will replay more than that.
 * @param timezone The zone to read it in. Empty or null is whatever the process runs in.
 * @returns How many fell between `from` and now, or `limit + 1` when more did than anyone will replay.
 */
export declare function missedRuns(expression: string, from: number, limit: number, timezone?: string | null): number;
/**
 * Reads an expression without scheduling anything.
 *
 * @param expression The cron expression to read.
 * @param timezone The zone to read it in. Empty or null is whatever the process runs in.
 * @returns What is wrong with it, or null when nothing is.
 */
export declare function cronError(expression: string, timezone?: string | null): string | null;
//# sourceMappingURL=cron.d.ts.map