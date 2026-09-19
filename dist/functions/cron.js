"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextRun = nextRun;
exports.missedRuns = missedRuns;
exports.cronError = cronError;
const cron_parser_1 = require("cron-parser");
/**
 * When an expression next comes round.
 *
 * @param expression The cron expression to read.
 * @param from The moment to look forward from, in unix ms.
 * @param timezone The zone to read it in. Empty or null is whatever the process runs in.
 * @returns The next matching moment, in unix ms.
 */
function nextRun(expression, from, timezone) {
    const parsed = cron_parser_1.CronExpressionParser.parse(expression, { currentDate: new Date(from), tz: timezone || undefined });
    return parsed.next().getTime();
}
/**
 * Counts what an expression came round to.
 *
 * @param expression The cron expression to read.
 * @param from The moment it was last due, in unix ms.
 * @param limit How many are worth counting, since nothing will replay more than that.
 * @param timezone The zone to read it in. Empty or null is whatever the process runs in.
 * @returns How many fell between `from` and now, or `limit + 1` when more did than anyone will replay.
 */
function missedRuns(expression, from, limit, timezone) {
    const now = Date.now();
    if (limit <= 0 || from > now)
        return 0;
    const parsed = cron_parser_1.CronExpressionParser.parse(expression, { currentDate: new Date(from), tz: timezone || undefined });
    let missed = 1;
    while (missed <= limit && parsed.next().getTime() <= now)
        missed++;
    return missed;
}
/**
 * Reads an expression without scheduling anything.
 *
 * @param expression The cron expression to read.
 * @param timezone The zone to read it in. Empty or null is whatever the process runs in.
 * @returns What is wrong with it, or null when nothing is.
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