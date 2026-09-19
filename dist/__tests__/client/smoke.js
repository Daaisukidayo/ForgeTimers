"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reports = exports.EVENT_MESSAGE_CODE = exports.eventCode = exports.VERIFY_CODE = exports.SEED_CODE = exports.TIMEOUT_CODE = exports.TOLERANCE = exports.CARRIED = exports.OVERDUE_DELAY = exports.PAUSED_DELAY = exports.CRON_EXPRESSION = exports.CRON_SECONDS = exports.INTERVAL_TICK = exports.TIMEOUT_DELAY = exports.DOWNTIME = exports.SPEED = exports.CHANNEL = exports.PAUSED_NAME = exports.CRON_NAME = exports.OVERDUE_NAME = exports.INTERVAL_NAME = exports.TIMEOUT_NAME = exports.FAIL = exports.PASS = exports.SEEDED = exports.bold = exports.grey = exports.cyan = exports.yellow = exports.red = exports.green = void 0;
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
exports.CRON_NAME = "smoke-cron";
exports.PAUSED_NAME = "smoke-paused";
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
/**
 * Seconds between cron runs, kept to a divisor of 60 so every occurrence lands on a whole
 * multiple of it and the restart can be checked against the expression's own beat.
 */
exports.CRON_SECONDS = [30, 20, 15, 10, 5, 2, 1].find((n) => n <= Math.max(1, 20 / exports.SPEED)) ?? 1;
exports.CRON_EXPRESSION = `*/${exports.CRON_SECONDS} * * * * *`;
/** A hold freezes what is left, so this only has to be short enough to wait out once resumed */
exports.PAUSED_DELAY = seconds(Math.max(5_000, 10_000 / exports.SPEED));
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
    ? `$smokeReport[timeout]$let[sent;$sendMessage[${exports.CHANNEL};ForgeTimers restart check;true]]$smokeReport[sent:$get[sent]]`
    : `$smokeReport[timeout]`;
exports.SEED_CODE = `$let[carried;${exports.CARRIED}]` +
    `$setTimeout[${exports.TIMEOUT_CODE};${exports.TIMEOUT_DELAY};${exports.TIMEOUT_NAME}]` +
    `$setTimeout[$smokeReport[overdue:$get[carried]];${exports.OVERDUE_DELAY};${exports.OVERDUE_NAME}]` +
    `$setInterval[$smokeReport[interval];${exports.INTERVAL_TICK};${exports.INTERVAL_NAME}]` +
    `$setCron[$smokeReport[cron];${exports.CRON_EXPRESSION};${exports.CRON_NAME}]` +
    `$setTimeout[$smokeReport[woken];${exports.PAUSED_DELAY};${exports.PAUSED_NAME}]$pauseTimer[timeout;${exports.PAUSED_NAME}]` +
    `$smokeReport[seeded]`;
/**
 * What the second boot runs. The held timer is read before it is let go of, so the restart is
 * caught leaving it alone rather than only the resume being caught working.
 */
exports.VERIFY_CODE = `$smokeReport[booted]` +
    `$smokeReport[still-held:$getTimer[timeout;${exports.PAUSED_NAME};paused]]` +
    `$smokeReport[left-alone:$timerRunning[timeout;${exports.PAUSED_NAME}]]` +
    `$smokeReport[let-go:$resumeTimer[timeout;${exports.PAUSED_NAME}]]`;
/** Every event reports under the name of the timer it is about */
const eventCode = (event) => `$smokeReport[event-${event}:$timerData[name]]`;
exports.eventCode = eventCode;
/** An event command runs with no target of its own, so this checks one can still reach discord */
exports.EVENT_MESSAGE_CODE = `$if[$timerData[name]==${exports.TIMEOUT_NAME};` +
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
    const cron = await structures_1.Database.get(structures_1.TimerKind.cron, exports.CRON_NAME);
    if (!cron)
        throw new Error(`${exports.CRON_NAME} was scheduled but never persisted`);
    if (cron.cron !== exports.CRON_EXPRESSION)
        throw new Error(`${exports.CRON_NAME} stored "${cron.cron}", not its expression`);
    const held = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.PAUSED_NAME);
    if (!held)
        throw new Error(`${exports.PAUSED_NAME} was scheduled but never persisted`);
    if (!held.isPaused())
        throw new Error(`${exports.PAUSED_NAME} was paused, but its record does not say so`);
    const announced = await until(() => seen(`event-timerStart:${exports.TIMEOUT_NAME}`), 5_000);
    if (!announced)
        throw new Error(`${exports.TIMEOUT_NAME} was scheduled, but timerStart never reached its command`);
    (0, node_fs_1.writeFileSync)(MARKER, JSON.stringify({ timeoutDueAt: row.fireAt, overdueDueAt: overdue.fireAt, seededAt: Date.now() }, null, 2), "utf8");
    console.log((0, exports.grey)(`due at ${new Date(row.fireAt).toISOString()}, ${Math.round(row.timeLeft() / 1000)}s from now`));
    console.log((0, exports.cyan)(exports.SEEDED));
}
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
/** Resuming happens on the second boot, so what was left of the hold only starts counting there */
async function waitForTheWoken() {
    if (seen("woken", bootedAt))
        return;
    const held = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.PAUSED_NAME);
    const untilRun = (held?.fireAt ?? 0) - Date.now();
    if (untilRun <= 0)
        return;
    console.log((0, exports.grey)(`waiting ${Math.round(untilRun / 1000)}s more for the timer that was let go of`));
    await wait(untilRun + exports.TOLERANCE);
}
/** The cron keeps to the clock rather than to a gap, so its next occurrence is never far off */
async function waitForTheCron() {
    if (seen("cron", bootedAt))
        return;
    const due = await structures_1.Database.get(structures_1.TimerKind.cron, exports.CRON_NAME);
    const untilRun = (due?.fireAt ?? 0) - Date.now();
    if (untilRun <= 0)
        return;
    console.log((0, exports.grey)(`waiting ${Math.round(untilRun / 1000)}s more for the cron's next occurrence`));
    await wait(untilRun + exports.TOLERANCE);
}
async function waitForDiscord() {
    if (!exports.CHANNEL)
        return;
    const arrived = await until(() => !!seen("sent", bootedAt) && !!seen("event-message", bootedAt), 20_000);
    if (!arrived)
        console.log((0, exports.grey)("discord never answered one of the two messages"));
}
async function verify(plan) {
    const left = plan.timeoutDueAt - Date.now();
    console.log((0, exports.grey)(`waiting ${Math.round(left / 1000)}s for the deadline set before the restart`));
    await wait(left + exports.TOLERANCE + 1000);
    await waitForTheBeat();
    await waitForTheCron();
    await waitForTheWoken();
    await waitForDiscord();
    const fired = seen("timeout", bootedAt);
    const drift = fired ? fired.at - plan.timeoutDueAt : null;
    const ticked = seen("interval", bootedAt);
    const row = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.TIMEOUT_NAME);
    const late = seen("overdue", bootedAt);
    const lateBy = late ? late.at - plan.overdueDueAt : null;
    const carried = late?.label.split(":")[1];
    const overdueRow = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.OVERDUE_NAME);
    const ran = seen("cron", bootedAt);
    const cronRow = await structures_1.Database.get(structures_1.TimerKind.cron, exports.CRON_NAME);
    // an occurrence of `*/n * * * * *` always lands on a whole n seconds, so a restored cron that
    // came back on the leftover of a gap instead of on the clock shows up here
    const nextRun = cronRow ? new Date(cronRow.fireAt) : null;
    const onTheBeat = !!nextRun && nextRun.getMilliseconds() === 0 && nextRun.getSeconds() % exports.CRON_SECONDS === 0;
    const stillHeld = seen("still-held", bootedAt)?.label.split(":")[1];
    const leftAlone = seen("left-alone", bootedAt)?.label.split(":")[1];
    const letGo = seen("let-go", bootedAt)?.label.split(":")[1];
    const woken = seen("woken", bootedAt);
    const heldRow = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.PAUSED_NAME);
    const restoreEvent = seen(`event-timerRestore:${exports.TIMEOUT_NAME}`, bootedAt);
    const fireEvent = seen(`event-timerFire:${exports.TIMEOUT_NAME}`, bootedAt);
    // a snowflake back from $sendMessage is discord saying it accepted the message
    const sent = seen("sent", bootedAt)?.label.split(":")[1];
    const eventSent = seen("event-message", bootedAt)?.label.split(":")[1];
    const checks = [
        ["the timeout ran after the restart", !!fired],
        [`it ran on its original deadline (drift ${drift ?? "n/a"}ms)`, drift !== null && Math.abs(drift) <= exports.TOLERANCE],
        ["the interval kept ticking", !!ticked],
        ["the held timer came back held", stillHeld === "true"],
        ["and the restart armed nothing for it", leftAlone === "false"],
        ["letting it go worked", letGo === "true"],
        ["and then it ran, with its record spent", !!woken && heldRow === null],
        ["the cron ran after the restart", !!ran],
        [
            `its next run came off the expression, not off a leftover gap (${nextRun?.toISOString() ?? "no row"})`,
            onTheBeat,
        ],
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
    await structures_1.Database.delete(structures_1.TimerKind.cron, exports.CRON_NAME).catch(() => undefined);
    await structures_1.Database.delete(structures_1.TimerKind.timeout, exports.PAUSED_NAME).catch(() => undefined);
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