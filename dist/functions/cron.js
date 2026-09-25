"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextRun = nextRun;
exports.missedRuns = missedRuns;
exports.cronError = cronError;
const cron_parser_1 = require("cron-parser");
/**
 * An expression walking forward from `from`. Throws on one that can't be read.
 * @param expression Cron expression.
 * @param from Moment to start at, unix ms.
 * @param timezone Zone to read it in. Empty or null is the process zone.
 */
function parse(expression, from, timezone) {
    return cron_parser_1.CronExpressionParser.parse(expression, { currentDate: new Date(from), tz: timezone || undefined });
}
/**
 * When an expression next comes round.
 * @param expression Cron expression.
 * @param from Moment to look forward from, unix ms.
 * @param timezone Zone to read it in. Empty or null is the process zone.
 * @returns Next match, unix ms.
 */
function nextRun(expression, from, timezone) {
    return parse(expression, from, timezone).next().getTime();
}
/**
 * Counts occurrences since `from`, up to `limit`.
 * @param expression Cron expression.
 * @param from When it was last due, unix ms.
 * @param limit Most worth counting, nothing replays more.
 * @param timezone Zone to read it in. Empty or null is the process zone.
 * @returns How many fell between `from` and now, `limit + 1` once past the limit.
 */
function missedRuns(expression, from, limit, timezone) {
    const now = Date.now();
    if (limit <= 0 || from > now)
        return 0;
    const parsed = parse(expression, from, timezone);
    let missed = 1;
    while (missed <= limit && parsed.next().getTime() <= now)
        missed++;
    return missed;
}
/**
 * Parses an expression without scheduling anything.
 * @param expression Cron expression.
 * @param timezone Zone to read it in. Empty or null is the process zone.
 * @returns What is wrong with it, null when nothing is.
 */
function cronError(expression, timezone) {
    try {
        nextRun(expression, Date.now(), timezone);
        return null;
    }
    catch (err) {
        return err instanceof Error ? err.message : String(err);
    }
}
//# sourceMappingURL=cron.js.map