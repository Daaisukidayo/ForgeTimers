"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./support/harness");
const types_1 = require("../types");
const logger_1 = require("../functions/logger");
let harness;
(0, harness_1.useHarness)((booted) => (harness = booted));
/** Listens for an event, throws, and hands back whatever the logger was told while it did. */
async function withThrowingListener(event, work) {
    const failed = [];
    const error = logger_1.Logger.error;
    logger_1.Logger.error = (...args) => void failed.push(args[0]);
    harness.ext.emitter.on(event, () => {
        throw new Error("a listener blew up");
    });
    try {
        await work(failed);
    }
    finally {
        harness.ext.emitter.removeAllListeners(event);
        logger_1.Logger.error = error;
    }
}
(0, node_test_1.describe)("an event listener that throws", () => {
    (0, node_test_1.it)("leaves the timeout that reported to it spent, rather than fired and still stored", async () => {
        await withThrowingListener(types_1.TimerEvent.timerFire, async (failed) => {
            await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];60;live]");
            strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 2000), "the timer never ran");
            strict_1.default.ok(await (0, harness_1.waitFor)(() => failed.length > 0, 1000), "the throw was swallowed without a word");
            // with the record left behind it would be restored, and fire again, on the next boot
            strict_1.default.ok(await (0, harness_1.waitFor)(async () => !(await harness_1.Database.get(harness_1.TimerKind.timeout, "live")), 1000), "the throw stopped the timeout from giving up its record");
        });
    });
    (0, node_test_1.it)("leaves a run startup picked back up spent too", async () => {
        await withThrowingListener(types_1.TimerEvent.timerFire, async (failed) => {
            await (0, harness_1.persist)(new harness_1.Timer({ name: "late", kind: harness_1.TimerKind.timeout, code: "$testMark[ran]", duration: 1000 }), Date.now() - 1000);
            await harness.ready();
            strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran"), 2000), "the restored timer never ran");
            strict_1.default.ok(await (0, harness_1.waitFor)(() => failed.length > 0, 1000), "the throw was swallowed without a word");
            strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "late"), null, "and it kept its record");
        });
    });
    (0, node_test_1.it)("does not turn the command that scheduled a timer into an error", async () => {
        await withThrowingListener(types_1.TimerEvent.timerStart, async (failed) => {
            const said = await (0, harness_1.run)(harness, "$setTimeout[x;1h;n]");
            strict_1.default.notEqual(said, null, "the listener failed the command, though the timer was scheduled");
            strict_1.default.ok(failed.length > 0, "the throw was swallowed without a word");
            strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, "n"));
        });
    });
});
//# sourceMappingURL=throws.test.js.map