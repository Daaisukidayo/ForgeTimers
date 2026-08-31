"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const structures_1 = require("../structures");
const schedule_1 = require("../functions/schedule");
const make = (duration, kind = structures_1.TimerKind.interval) => new structures_1.Timer({ name: "t", kind, duration, channelID: "c" });
(0, node_test_1.describe)("Timer arithmetic", () => {
    (0, node_test_1.it)("starts due one duration out", () => {
        const t = make(1000);
        strict_1.default.equal(t.fireAt, t.timestamp + 1000);
        strict_1.default.ok(t.timeLeft() > 900 && t.timeLeft() <= 1000);
        strict_1.default.equal(t.overdueBy(), 0);
        strict_1.default.equal(t.isOverdue(), false);
    });
    (0, node_test_1.it)("reports how far past due it is", () => {
        const t = make(1000);
        t.fireAt = Date.now() - 2500;
        strict_1.default.ok(t.overdueBy() >= 2500);
        strict_1.default.equal(t.isOverdue(), true);
        strict_1.default.equal(t.timeLeft(), 0, "time left never goes negative");
    });
    (0, node_test_1.it)("counts the tick due now among the missed ones", () => {
        const t = make(1000);
        t.fireAt = Date.now();
        strict_1.default.equal(t.missedTicks(), 1);
        t.fireAt = Date.now() - 2500;
        strict_1.default.equal(t.missedTicks(), 3);
    });
    (0, node_test_1.it)("never reports missed ticks for a timeout", () => {
        const t = make(1000, structures_1.TimerKind.timeout);
        t.fireAt = Date.now() - 10_000;
        strict_1.default.equal(t.missedTicks(), 0);
    });
    (0, node_test_1.it)("advance() keeps the phase instead of drifting", () => {
        const t = make(1000);
        const due = t.fireAt;
        t.advance();
        strict_1.default.equal(t.fireAt, due + 1000, "one whole tick, measured from the old due time");
    });
    (0, node_test_1.it)("advance() catches up by whole ticks after a slow run", () => {
        const t = make(1000);
        t.fireAt = Date.now() - 2500;
        t.advance();
        const ahead = t.fireAt - Date.now();
        strict_1.default.ok(ahead > 0 && ahead <= 1000, `landed ${ahead}ms out, expected within one tick`);
    });
    (0, node_test_1.it)("advance() terminates on a zero duration", () => {
        const t = make(0);
        t.advance();
        strict_1.default.ok(t.fireAt >= Date.now() - 5);
    });
    (0, node_test_1.it)("scheduleNext() abandons the phase and waits a full duration", () => {
        const t = make(1000);
        t.fireAt = Date.now() - 5000;
        t.scheduleNext();
        strict_1.default.ok(t.fireAt - Date.now() > 900);
    });
});
(0, node_test_1.describe)("name and id limits", () => {
    (0, node_test_1.it)("builds ids as kind:name", () => {
        strict_1.default.equal(structures_1.Timer.idOf(structures_1.TimerKind.timeout, "x"), "timeout:x");
    });
    (0, node_test_1.it)("leaves room for the kind inside the 255 character key", () => {
        for (const kind of [structures_1.TimerKind.timeout, structures_1.TimerKind.interval]) {
            const longest = "x".repeat(structures_1.Timer.maxNameLength(kind));
            strict_1.default.equal(structures_1.Timer.idOf(kind, longest).length, structures_1.Timer.MAX_ID_LENGTH);
            strict_1.default.ok(structures_1.Timer.idOf(kind, longest + "x").length > structures_1.Timer.MAX_ID_LENGTH);
        }
    });
});
(0, node_test_1.describe)("long delays", () => {
    (0, node_test_1.it)("does not collapse a delay past node's cap", async () => {
        let fired = false;
        let live;
        let arms = 0;
        (0, schedule_1.setLongTimeout)(90 * 24 * 60 * 60 * 1000, () => (fired = true), (h) => {
            live = h;
            arms++;
        });
        await new Promise((r) => setTimeout(r, 150));
        clearTimeout(live);
        strict_1.default.equal(fired, false, "a 90 day timeout fired immediately, the 32-bit cap is back");
        strict_1.default.equal(arms, 1, `re-armed ${arms} times in 150ms, the delay is not being capped`);
    });
    (0, node_test_1.it)("does not tick an interval whose tick is past the cap", async () => {
        let ticks = 0;
        let live;
        let arms = 0;
        (0, schedule_1.setLongInterval)(90 * 24 * 60 * 60 * 1000, () => { ticks++; }, (h) => {
            live = h;
            arms++;
        });
        await new Promise((r) => setTimeout(r, 150));
        clearInterval(live);
        strict_1.default.equal(ticks, 0);
        strict_1.default.equal(arms, 1, `re-armed ${arms} times in 150ms`);
    });
    (0, node_test_1.it)("still fires a short delay on time", async () => {
        const started = Date.now();
        const fired = await new Promise((resolve) => {
            (0, schedule_1.setLongTimeout)(120, () => resolve(Date.now() - started));
        });
        strict_1.default.ok(fired >= 110 && fired < 400, `fired after ${fired}ms`);
    });
    (0, node_test_1.it)("ticks a short interval repeatedly", async () => {
        let ticks = 0;
        let live;
        (0, schedule_1.setLongInterval)(50, () => { ticks++; }, (h) => (live = h));
        await new Promise((r) => setTimeout(r, 260));
        clearInterval(live);
        strict_1.default.ok(ticks >= 3, `only ${ticks} ticks`);
    });
    (0, node_test_1.it)("hands every re-armed chunk to onArm so it stays cancellable", async () => {
        const handles = [];
        (0, schedule_1.setLongTimeout)(schedule_1.MAX_DELAY + 50, () => undefined, (h) => handles.push(h));
        strict_1.default.equal(handles.length, 1, "the first chunk is reported straight away");
        clearTimeout(handles[0]);
    });
});
//# sourceMappingURL=timer.test.js.map