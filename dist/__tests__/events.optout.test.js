"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const types_1 = require("../types");
let harness;
(0, node_test_1.before)(async () => (harness = await (0, harness_1.boot)()));
(0, node_test_1.after)(async () => {
    harness.disarm();
    await harness.cleanup();
});
(0, node_test_1.describe)("an extension that was not asked for events", () => {
    (0, node_test_1.it)("listens to none of them", () => {
        for (const event of Object.values(types_1.TimerEvent)) {
            strict_1.default.equal(harness.ext.emitter.listenerCount(event), 0, `${event} was armed without being asked for`);
        }
    });
    (0, node_test_1.it)("still runs the timers themselves", async () => {
        await (0, harness_1.run)(harness, "$setTimeout[$testMark[ran];50;quick]");
        strict_1.default.ok(await (0, harness_1.waitFor)(() => harness_1.marks.includes("ran")));
        strict_1.default.deepEqual(harness_1.marks, ["ran"], "an event slipped through");
    });
});
//# sourceMappingURL=events.optout.test.js.map