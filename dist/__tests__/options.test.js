"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const __1 = require("..");
const logger_1 = require("../functions/logger");
(0, harness_1.useTempHome)("forgetimers-options");
(0, node_test_1.beforeEach)(async () => {
    harness_1.marks.length = 0;
    await harness_1.Database.wipe().catch(() => undefined);
});
/** What the extension said about the config, and what it did with the timers it found */
async function boots(options, seed = async () => undefined) {
    const said = [];
    const warn = logger_1.Logger.warn;
    logger_1.Logger.warn = (...args) => said.push(args.join(" "));
    let harness;
    try {
        harness = (0, harness_1.attach)(new __1.ForgeTimers(options));
        strict_1.default.equal(await harness.ext.ready, true, "the extension refused to open at all");
    }
    finally {
        logger_1.Logger.warn = warn;
    }
    harness.channels.set("chan-1", { id: "chan-1" });
    await harness_1.Database.wipe();
    await seed(harness);
    await harness.ready();
    return { said, harness };
}
const late = (name, lateBy) => Object.assign(new harness_1.Timer({ name, kind: harness_1.TimerKind.timeout, code: `$testMark[${name}]`, duration: 60_000, channelID: "chan-1" }), { fireAt: Date.now() - lateBy });
const behind = (name, duration, lateBy) => Object.assign(new harness_1.Timer({ name, kind: harness_1.TimerKind.interval, code: "$testMark[tick]", duration, channelID: "chan-1" }), { fireAt: Date.now() - lateBy });
const ticks = () => harness_1.marks.filter((mark) => mark === "tick").length;
(0, node_test_1.describe)("a config nobody meant to write", () => {
    (0, node_test_1.it)("names the backends when asked for one that does not exist", async () => {
        const { said, harness } = await boots({ storage: "postgres" });
        strict_1.default.ok(said.some((line) => line.includes("postgres") && line.includes("not a backend")), `nothing was said about it: ${said}`);
        harness.disarm();
    });
    (0, node_test_1.it)("says a negative maxOverdue throws every late timer away, and then does it", async () => {
        const { said, harness } = await boots({ timeoutConfig: { maxOverdue: -5 } }, async () => {
            await harness_1.Database.set(late("n", 1000));
        });
        strict_1.default.ok(said.some((line) => line.includes("maxOverdue") && line.includes("throws away")), `nothing was said about it: ${said}`);
        strict_1.default.ok(!(await (0, harness_1.waitFor)(() => harness_1.marks.includes("n"), 200)), "it ran anyway");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"), null, "and the record survived");
        harness.disarm();
    });
    (0, node_test_1.it)("leaves a zero maxOverdue alone, which is the documented no limit", async () => {
        const { said, harness } = await boots({ timeoutConfig: { maxOverdue: 0 } }, async () => {
            await harness_1.Database.set(late("n", 1000));
        });
        strict_1.default.deepEqual(said, [], `0 is a real setting, not a mistake: ${said}`);
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("n")), "a timer past a limit of none was dropped");
        harness.disarm();
    });
    (0, node_test_1.it)("points a negative tick limit at Infinity, and replays nothing meanwhile", async () => {
        const { said, harness } = await boots({ intervalConfig: { restoredTicksLimit: -1 } }, async () => {
            await harness_1.Database.set(behind("b", 1000, 4500));
        });
        strict_1.default.ok(said.some((line) => line.includes("restoredTicksLimit") && line.includes("Infinity")), `nothing was said about it: ${said}`);
        strict_1.default.ok(!(await (0, harness_1.waitFor)(() => ticks() > 0, 200)), "a negative limit replayed ticks");
        harness.disarm();
    });
    (0, node_test_1.it)("replays every missed tick at Infinity", async () => {
        const { harness } = await boots({ intervalConfig: { restoredTicksLimit: Infinity } }, async () => {
            await harness_1.Database.set(behind("b", 1000, 4500));
        });
        strict_1.default.ok(await (0, harness_1.waitFor)(() => ticks() >= 5), `replayed ${ticks()} of the 5 missed ticks`);
        harness.disarm();
    });
    (0, node_test_1.it)("replays whole ticks when the limit is not a whole number", async () => {
        const { harness } = await boots({ intervalConfig: { restoredTicksLimit: 2.7 } }, async () => {
            await harness_1.Database.set(behind("b", 1000, 4500));
        });
        strict_1.default.ok(await (0, harness_1.waitFor)(() => ticks() >= 3), `replayed ${ticks()}`);
        strict_1.default.equal(ticks(), 3, "a fraction of a tick is still a tick");
        harness.disarm();
    });
    (0, node_test_1.it)("names an event nobody emits, and forgescript stops the boot over it", () => {
        const said = [];
        const warn = logger_1.Logger.warn;
        logger_1.Logger.warn = (...args) => said.push(args.join(" "));
        try {
            strict_1.default.throws(() => (0, harness_1.attach)(new __1.ForgeTimers({ events: ["timerFires"] })), /not supported/);
        }
        finally {
            logger_1.Logger.warn = warn;
        }
        strict_1.default.ok(said.some((line) => line.includes("timerFires") && line.includes("not a timer event")), `the boot died without saying which event was wrong: ${said}`);
    });
    (0, node_test_1.it)("takes persist as written, so a string is not an off switch", async () => {
        const { harness } = await boots({ timeoutConfig: { persist: "false" } }, async () => {
            await harness_1.Database.set(late("n", 1000));
        });
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("n")), 'persist: "false" is a truthy string, not false');
        harness.disarm();
    });
});
//# sourceMappingURL=options.test.js.map