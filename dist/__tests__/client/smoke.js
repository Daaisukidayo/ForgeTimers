"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reports = exports.EVENT_MESSAGE_CODE = exports.eventCode = exports.SEED_CODE = exports.TIMEOUT_CODE = exports.TOLERANCE = exports.CARRIED = exports.OVERDUE_DELAY = exports.INTERVAL_TICK = exports.TIMEOUT_DELAY = exports.DOWNTIME = exports.SPEED = exports.CHANNEL = exports.OVERDUE_NAME = exports.INTERVAL_NAME = exports.TIMEOUT_NAME = exports.FAIL = exports.PASS = exports.SEEDED = exports.bold = exports.grey = exports.cyan = exports.yellow = exports.red = exports.green = void 0;
exports.readPlan = readPlan;
exports.clearPlan = clearPlan;
exports.report = report;
exports.runSmoke = runSmoke;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const structures_1 = require("../../structures");
const dotenv_1 = require("dotenv");
(0, dotenv_1.config)();
const paint = (codes) => (text) => (process.env.NO_COLOR ? text : `\u001b[${codes}m${text}\u001b[0m`);
exports.green = paint("32");
exports.red = paint("31");
exports.yellow = paint("33");
exports.cyan = paint("36");
exports.grey = paint("90");
exports.bold = paint("1");
exports.SEEDED = "SMOKE:SEEDED";
exports.PASS = "SMOKE:PASS";
exports.FAIL = "SMOKE:FAIL";
exports.TIMEOUT_NAME = "smoke-timeout";
exports.INTERVAL_NAME = "smoke-interval";
exports.OVERDUE_NAME = "smoke-overdue";
exports.CHANNEL = process.env.SMOKE_CHANNEL;
exports.SPEED = Math.max(1, Number(process.env.SMOKE_SPEED ?? 2));
/** How long the two boots take before the deadline can land: a cold login, and discord throttling the second one */
const BOOT_BUDGET = Number(process.env.SMOKE_BOOT_BUDGET ?? 25_000);
/** How long the bot stays down between the two runs */
exports.DOWNTIME = Math.round(Number(process.env.SMOKE_DOWNTIME ?? 25_000) / exports.SPEED);
const seconds = (ms) => `${Math.max(1, Math.round(ms / 1000))}s`;
/** Still ahead of the second boot whatever the speed, or the timer would come due before anyone looks */
exports.TIMEOUT_DELAY = seconds(Math.max(60_000 / exports.SPEED, exports.DOWNTIME + BOOT_BUDGET));
exports.INTERVAL_TICK = seconds(20_000 / exports.SPEED);
/** Shorter than the downtime, so this one comes due while the bot is off */
exports.OVERDUE_DELAY = seconds(Math.min(10_000 / exports.SPEED, exports.DOWNTIME * 0.4));
/** Set before the timers are scheduled, and read back by one of them after the restart */
exports.CARRIED = "carried-across";
exports.TOLERANCE = 3000;
const MARKER = (0, node_path_1.join)(process.cwd(), ".forgetimers-smoke.json");
function readPlan() {
    if (!(0, node_fs_1.existsSync)(MARKER))
        return null;
    try {
        return JSON.parse((0, node_fs_1.readFileSync)(MARKER, "utf8"));
    }
    catch {
        return null;
    }
}
function clearPlan() {
    (0, node_fs_1.rmSync)(MARKER, { force: true });
}
exports.TIMEOUT_CODE = exports.CHANNEL
    ? `$let[sent;$sendMessage[${exports.CHANNEL};ForgeTimers restart check;true]]$smokeReport[timeout:$get[sent]]`
    : `$smokeReport[timeout]`;
exports.SEED_CODE = `$let[carried;${exports.CARRIED}]` +
    `$setTimeout[${exports.TIMEOUT_CODE};${exports.TIMEOUT_DELAY};${exports.TIMEOUT_NAME}]` +
    `$setTimeout[$smokeReport[overdue:$get[carried]];${exports.OVERDUE_DELAY};${exports.OVERDUE_NAME}]` +
    `$setInterval[$smokeReport[interval];${exports.INTERVAL_TICK};${exports.INTERVAL_NAME}]` +
    `$smokeReport[seeded]`;
/** Every event reports under the name of the timer it is about */
const eventCode = (event) => `$smokeReport[event-${event}:$env[name]]`;
exports.eventCode = eventCode;
/** An event command runs with no target of its own, so this checks one can still reach discord */
exports.EVENT_MESSAGE_CODE = `$if[$env[name]==${exports.TIMEOUT_NAME};` +
    `$let[sent;$sendMessage[${exports.CHANNEL};ForgeTimers event check;true]]$smokeReport[event-message:$get[sent]]]`;
exports.reports = [];
function report(label) {
    exports.reports.push({ label, at: Date.now() });
}
const bootedAt = Date.now();
// the timeout reports "timeout" alone, or "timeout:<message id>" when it sent something
const seen = (label, after = 0) => exports.reports.find((r) => (r.label === label || r.label.startsWith(`${label}:`)) && r.at >= after);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
async function runSmoke(plan) {
    try {
        if (plan)
            await verify(plan);
        else
            await seed();
    }
    catch (err) {
        console.error((0, exports.red)(String(err instanceof Error ? err.stack : err)));
        console.log((0, exports.red)(exports.FAIL));
        process.exit(1);
    }
}
async function seed() {
    const scheduled = await until(() => seen("seeded"), 30_000);
    if (!scheduled)
        throw new Error("the clientReady command never scheduled the smoke timers");
    const row = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.TIMEOUT_NAME);
    if (!row)
        throw new Error(`${exports.TIMEOUT_NAME} was scheduled but never persisted`);
    const overdue = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.OVERDUE_NAME);
    if (!overdue)
        throw new Error(`${exports.OVERDUE_NAME} was scheduled but never persisted`);
    const announced = await until(() => seen(`event-timerStart:${exports.TIMEOUT_NAME}`), 5_000);
    if (!announced)
        throw new Error(`${exports.TIMEOUT_NAME} was scheduled, but timerStart never reached its command`);
    (0, node_fs_1.writeFileSync)(MARKER, JSON.stringify({ timeoutDueAt: row.fireAt, overdueDueAt: overdue.fireAt, seededAt: Date.now() }, null, 2), "utf8");
    console.log((0, exports.grey)(`due at ${new Date(row.fireAt).toISOString()}, ${Math.round(row.timeLeft() / 1000)}s from now`));
    console.log((0, exports.cyan)(exports.SEEDED));
}
/**
 * A restored interval starts a whole fresh tick rather than the remainder, so its first tick can land
 * after the timeout's deadline - a slow login on either boot is enough. Waiting on the row it wrote
 * keeps the check about whether it ticks at all, not about how long discord took to connect.
 */
async function waitForTheBeat() {
    if (seen("interval", bootedAt))
        return;
    const beat = await structures_1.Database.get(structures_1.TimerKind.interval, exports.INTERVAL_NAME);
    const untilTick = (beat?.fireAt ?? 0) - Date.now();
    if (untilTick <= 0)
        return;
    console.log((0, exports.grey)(`waiting ${Math.round(untilTick / 1000)}s more for the interval's first tick`));
    await wait(untilTick + exports.TOLERANCE);
}
async function verify(plan) {
    const left = plan.timeoutDueAt - Date.now();
    console.log((0, exports.grey)(`waiting ${Math.round(left / 1000)}s for the deadline set before the restart`));
    await wait(left + exports.TOLERANCE + 1000);
    await waitForTheBeat();
    const fired = seen("timeout", bootedAt);
    const drift = fired ? fired.at - plan.timeoutDueAt : null;
    const ticked = seen("interval", bootedAt);
    const row = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.TIMEOUT_NAME);
    const late = seen("overdue", bootedAt);
    const lateBy = late ? late.at - plan.overdueDueAt : null;
    const carried = late?.label.split(":")[1];
    const overdueRow = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.OVERDUE_NAME);
    const restoreEvent = seen(`event-timerRestore:${exports.TIMEOUT_NAME}`, bootedAt);
    const fireEvent = seen(`event-timerFire:${exports.TIMEOUT_NAME}`, bootedAt);
    // a snowflake back from $sendMessage is discord saying it accepted the message
    const sent = fired?.label.split(":")[1];
    const eventSent = seen("event-message", bootedAt)?.label.split(":")[1];
    const checks = [
        ["the timeout ran after the restart", !!fired],
        [`it ran on its original deadline (drift ${drift ?? "n/a"}ms)`, drift !== null && Math.abs(drift) <= exports.TOLERANCE],
        ["the interval kept ticking", !!ticked],
        ["the spent timeout was deleted", row === null],
        [`the timeout that came due while it was down ran (${lateBy ?? "n/a"}ms late)`, !!late],
        [`its variables came back with it (${carried ?? "nothing"})`, carried === exports.CARRIED],
        ["it was deleted too", overdueRow === null],
        ["the restart reported the timer it picked up", !!restoreEvent],
        ["the run was reported as well", !!fireEvent],
        ...(exports.CHANNEL
            ? [
                [`its message reached discord (${sent ?? "nothing came back"})`, /^\d{17,20}$/.test(sent ?? "")],
                [
                    `the event command reached discord too (${eventSent ?? "nothing came back"})`,
                    /^\d{17,20}$/.test(eventSent ?? ""),
                ],
            ]
            : []),
    ];
    for (const [what, ok] of checks)
        console.log(`${ok ? (0, exports.green)("ok  ") : (0, exports.red)("FAIL")} ${what}`);
    clearPlan();
    await structures_1.Database.delete(structures_1.TimerKind.timeout, exports.TIMEOUT_NAME).catch(() => undefined);
    await structures_1.Database.delete(structures_1.TimerKind.timeout, exports.OVERDUE_NAME).catch(() => undefined);
    await structures_1.Database.delete(structures_1.TimerKind.interval, exports.INTERVAL_NAME).catch(() => undefined);
    const passed = checks.every(([, ok]) => ok);
    console.log(passed ? (0, exports.green)(exports.PASS) : (0, exports.red)(exports.FAIL));
    process.exit(passed ? 0 : 1);
}
async function until(condition, timeout) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (condition())
            return true;
        await wait(50);
    }
    return !!condition();
}
//# sourceMappingURL=smoke.js.map