"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.reports = exports.TOLERANCE = exports.INTERVAL_TICK = exports.TIMEOUT_DELAY = exports.INTERVAL_NAME = exports.TIMEOUT_NAME = exports.FAIL = exports.PASS = exports.SEEDED = void 0;
exports.readPlan = readPlan;
exports.clearPlan = clearPlan;
exports.report = report;
exports.runSmoke = runSmoke;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const structures_1 = require("../../structures");
exports.SEEDED = "SMOKE:SEEDED";
exports.PASS = "SMOKE:PASS";
exports.FAIL = "SMOKE:FAIL";
exports.TIMEOUT_NAME = "smoke-timeout";
exports.INTERVAL_NAME = "smoke-interval";
exports.TIMEOUT_DELAY = "60s";
exports.INTERVAL_TICK = "20s";
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
exports.reports = [];
function report(label) {
    exports.reports.push({ label, at: Date.now() });
}
const bootedAt = Date.now();
const seen = (label, after = 0) => exports.reports.find((r) => r.label === label && r.at >= after);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(ms, 0)));
async function runSmoke(plan) {
    try {
        if (plan)
            await verify(plan);
        else
            await seed();
    }
    catch (err) {
        console.error(err);
        console.log(exports.FAIL);
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
    (0, node_fs_1.writeFileSync)(MARKER, JSON.stringify({ timeoutDueAt: row.fireAt, seededAt: Date.now() }, null, 2), "utf8");
    console.log(`due at ${new Date(row.fireAt).toISOString()}, ${Math.round(row.timeLeft() / 1000)}s from now`);
    console.log(exports.SEEDED);
}
async function verify(plan) {
    const left = plan.timeoutDueAt - Date.now();
    console.log(`waiting ${Math.round(left / 1000)}s for the deadline set before the restart`);
    await wait(left + exports.TOLERANCE + 1000);
    const fired = seen("timeout", bootedAt);
    const drift = fired ? fired.at - plan.timeoutDueAt : null;
    const ticked = seen("interval", bootedAt);
    const row = await structures_1.Database.get(structures_1.TimerKind.timeout, exports.TIMEOUT_NAME);
    const checks = [
        ["the timeout ran after the restart", !!fired],
        [`it ran on its original deadline (drift ${drift ?? "n/a"}ms)`, drift !== null && Math.abs(drift) <= exports.TOLERANCE],
        ["the interval kept ticking", !!ticked],
        ["the spent timeout was deleted", row === null],
    ];
    for (const [what, ok] of checks)
        console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
    clearPlan();
    await structures_1.Database.delete(structures_1.TimerKind.timeout, exports.TIMEOUT_NAME).catch(() => undefined);
    await structures_1.Database.delete(structures_1.TimerKind.interval, exports.INTERVAL_NAME).catch(() => undefined);
    const passed = checks.every(([, ok]) => ok);
    console.log(passed ? exports.PASS : exports.FAIL);
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