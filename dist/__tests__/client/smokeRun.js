"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_child_process_1 = require("node:child_process");
const node_path_1 = require("node:path");
const smoke_1 = require("./smoke");
const BOT = (0, node_path_1.join)(__dirname, "client.js");
/** Long enough for the interval to miss a tick while the timeout is still pending */
const DOWNTIME = Number(process.env.SMOKE_DOWNTIME ?? 25_000);
const BOOT_TIMEOUT = 60_000;
const VERIFY_TIMEOUT = 180_000;
const SCENARIOS = [
    { id: "forgedb", label: "forgedb", seed: "forgedb", verify: "forgedb" },
    { id: "quorieldb", label: "quorieldb", seed: "quorieldb", verify: "quorieldb" },
    { id: "to-quorieldb", label: "forgedb -> quorieldb", seed: "forgedb", verify: "quorieldb" },
    { id: "to-forgedb", label: "quorieldb -> forgedb", seed: "quorieldb", verify: "forgedb" },
];
/**
 * Runs the bot until it prints one of `sentinels`, or until it exits on its own.
 * @param env What to hand the bot on top of this process's own environment.
 * @param label What to call this phase in the log.
 * @param sentinels Lines that end the phase.
 * @param timeout How long to give it.
 * @param killOnMatch Whether a match should stop the bot rather than wait for it to exit.
 */
function phase(env, label, sentinels, timeout, killOnMatch) {
    return new Promise((resolve) => {
        console.log(`\n=== ${label} ===`);
        const bot = (0, node_child_process_1.spawn)(process.execPath, [BOT], {
            env: { ...process.env, SMOKE: "1", ...env },
            stdio: ["ignore", "pipe", "inherit"],
        });
        let matched = null;
        let settled = false;
        let rest = "";
        const done = (code) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(guard);
            resolve({ matched, code });
        };
        const guard = setTimeout(() => {
            console.error(`${label} timed out after ${Math.round(timeout / 1000)}s`);
            stop();
        }, timeout);
        function stop() {
            if (bot.exitCode !== null)
                return;
            bot.kill();
            // a bot that ignores the polite ask still has to go
            setTimeout(() => bot.kill("SIGKILL"), 5000).unref();
        }
        bot.stdout.on("data", (chunk) => {
            process.stdout.write(chunk);
            // a sentinel can land split across two chunks
            rest += chunk.toString();
            const found = sentinels.find((s) => rest.includes(s));
            if (!found || matched)
                return;
            matched = found;
            if (killOnMatch)
                stop();
        });
        bot.on("exit", (code) => done(code));
        bot.on("error", (err) => {
            console.error(err);
            done(1);
        });
    });
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/**
 * Schedules on one boot and checks on the next.
 * @param scenario Which backends the two boots run on.
 * @returns Whether the timers came back intact.
 */
async function check(scenario) {
    console.log(`\n########## ${scenario.label} ##########`);
    // a run that died mid-way would otherwise send us straight to verifying
    (0, smoke_1.clearPlan)();
    const first = await phase({ SMOKE_STORAGE: scenario.seed }, "run 1 of 2 - scheduling", [smoke_1.SEEDED], BOOT_TIMEOUT, true);
    if (first.matched !== smoke_1.SEEDED) {
        console.error("\nthe bot never scheduled its timers, so there is nothing to restart into");
        return false;
    }
    console.log(`\nstopped. staying down ${Math.round(DOWNTIME / 1000)}s`);
    await wait(DOWNTIME);
    // a differing backend means the second boot has to migrate before it can restore
    const moving = scenario.seed !== scenario.verify;
    const env = { SMOKE_STORAGE: scenario.verify };
    if (moving)
        env.SMOKE_MIGRATE_FROM = scenario.seed;
    const label = moving ? "run 2 of 2 - migrating and verifying" : "run 2 of 2 - verifying";
    const second = await phase(env, label, [smoke_1.PASS, smoke_1.FAIL], VERIFY_TIMEOUT, false);
    if (second.matched === smoke_1.PASS)
        return true;
    console.error(second.matched === smoke_1.FAIL ? "\nthe restart check failed" : "\nthe bot stopped before it could report");
    return false;
}
async function main() {
    // one scenario when named, otherwise all of them, because each can break alone
    const only = process.env.SMOKE_ONLY;
    const scenarios = only ? SCENARIOS.filter((s) => s.id === only) : SCENARIOS;
    if (!scenarios.length) {
        console.error(`No scenario called "${only}". Pick one of: ${SCENARIOS.map((s) => s.id).join(", ")}`);
        process.exit(1);
    }
    const failed = [];
    for (const scenario of scenarios) {
        if (!(await check(scenario)))
            failed.push(scenario.label);
    }
    console.log("");
    for (const scenario of scenarios) {
        console.log(`${failed.includes(scenario.label) ? "FAIL" : "ok  "} ${scenario.label}`);
    }
    process.exit(failed.length ? 1 : 0);
}
void main();
//# sourceMappingURL=smokeRun.js.map