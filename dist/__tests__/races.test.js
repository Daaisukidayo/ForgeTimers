"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
let harness;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(0, node_test_1.before)(async () => {
    harness = await (0, harness_1.boot)();
    harness.channels.set("chan-1", { id: "chan-1" });
});
(0, node_test_1.beforeEach)(async () => {
    harness.disarm();
    await harness_1.Database.wipe();
    harness_1.marks.length = 0;
});
(0, node_test_1.after)(async () => {
    harness.disarm();
    await harness.cleanup();
});
async function withSlowWrites(delay, fn) {
    const real = harness_1.Database.set.bind(harness_1.Database);
    harness_1.Database.set = async (timer) => {
        await sleep(delay);
        return real(timer);
    };
    try {
        return await fn();
    }
    finally {
        harness_1.Database.set = real;
    }
}
(0, node_test_1.describe)("cancelling while a tick is in flight", () => {
    (0, node_test_1.it)("does not let a cancelled interval come back", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];60;pulse]");
        await (0, harness_1.waitFor)(() => harness_1.marks.length >= 1);
        await withSlowWrites(600, async () => {
            await sleep(150);
            strict_1.default.equal(await (0, harness_1.run)(harness, "$clearInterval[pulse]"), "true");
        });
        harness_1.marks.length = 0;
        await sleep(500);
        strict_1.default.equal(harness_1.marks.length, 0, "a cancelled interval kept ticking");
        strict_1.default.equal(harness.client.intervals.has("pulse"), false, "and armed itself again");
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.interval, "pulse"), null, "and wrote itself back");
    });
    (0, node_test_1.it)("does not leave the row behind when the write lands after the cancel", async () => {
        await (0, harness_1.run)(harness, "$setInterval[$testMark[tick];60;pulse]");
        await (0, harness_1.waitFor)(() => harness_1.marks.length >= 1);
        await withSlowWrites(600, async () => {
            await sleep(150);
            await (0, harness_1.run)(harness, "$clearInterval[pulse]");
            await sleep(700);
        });
        strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.interval, "pulse"), null);
    });
});
(0, node_test_1.describe)("replacing a timer while it runs", () => {
    (0, node_test_1.it)("does not let the outgoing timeout drop its replacement", async () => {
        const manager = harness.ext.timersManager;
        const first = new harness_1.Timer({ name: "job", kind: harness_1.TimerKind.timeout, code: "a", duration: 50, channelID: "chan-1" });
        let running = false;
        await manager.start(first, async () => {
            running = true;
            await sleep(1500);
            running = false;
        });
        await (0, harness_1.waitFor)(() => running);
        const second = new harness_1.Timer({
            name: "job",
            kind: harness_1.TimerKind.timeout,
            code: "b",
            duration: 3_600_000,
            channelID: "chan-1",
        });
        await manager.start(second, async () => undefined);
        const handle = harness.client.timeouts.get("job");
        await (0, harness_1.waitFor)(() => !running);
        try {
            strict_1.default.equal(harness.client.timeouts.has("job"), true, "the replacement lost its handle and cannot be cancelled");
            strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.timeout, "job"))?.code, "b", "and lost its record");
        }
        finally {
            clearTimeout(handle);
        }
    });
    (0, node_test_1.it)("keeps the replacement cancellable", async () => {
        const manager = harness.ext.timersManager;
        const first = new harness_1.Timer({ name: "job", kind: harness_1.TimerKind.timeout, code: "a", duration: 50, channelID: "chan-1" });
        let running = false;
        await manager.start(first, async () => {
            running = true;
            await sleep(1000);
            running = false;
        });
        await (0, harness_1.waitFor)(() => running);
        const second = new harness_1.Timer({ name: "job", kind: harness_1.TimerKind.timeout, code: "b", duration: 3_600_000, channelID: "chan-1" });
        await manager.start(second, async () => undefined);
        const handle = harness.client.timeouts.get("job");
        await (0, harness_1.waitFor)(() => !running);
        try {
            strict_1.default.equal(await (0, harness_1.run)(harness, "$clearTimeout[job]"), "true");
            strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "job"), null);
        }
        finally {
            clearTimeout(handle);
        }
    });
});
//# sourceMappingURL=races.test.js.map