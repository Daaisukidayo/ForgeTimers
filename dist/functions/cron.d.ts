/**
 * When an expression next comes round.
 * @param expression Cron expression.
 * @param from Moment to look forward from, unix ms.
 * @param timezone Zone to read it in. Empty or null is the process zone.
 * @returns Next match, unix ms.
 */
export declare function nextRun(expression: string, from: number, timezone?: string | null): number;
/**
 * Counts occurrences since `from`, up to `limit`.
 * @param expression Cron expression.
 * @param from When it was last due, unix ms.
 * @param limit Most worth counting, nothing replays more.
 * @param timezone Zone to read it in. Empty or null is the process zone.
 * @returns How many fell between `from` and now, `limit + 1` once past the limit.
 */
export declare function missedRuns(expression: string, from: number, limit: number, timezone?: string | null): number;
/**
 * Parses an expression without scheduling anything.
 * @param expression Cron expression.
 * @param timezone Zone to read it in. Empty or null is the process zone.
 * @returns What is wrong with it, null when nothing is.
 */
export declare function cronError(expression: string, timezone?: string | null): string | null;
//# sourceMappingURL=cron.d.ts.map