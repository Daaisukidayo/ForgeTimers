"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./support/harness");
const timer_1 = require("../properties/timer");
const types_1 = require("../types");
let harness;
(0, harness_1.useHarness)((booted) => (harness = booted), {
    options: { events: [types_1.TimerEvent.timerFire] },
    setup: (booted) => {
        booted.ext.commands.add({
            type: types_1.TimerEvent.timerFire,
            code: "$testMark[old=$oldTimer[args]|new=$newTimer[args]|cron=$timerData[cron]]",
        });
    },
});
(0, node_test_1.describe)("a filter property", () => {
    (0, node_test_1.it)("is refused when it only exists on the prototype", () => {
        for (const named of ["toString", "constructor", "hasOwnProperty", "valueOf", "__proto__"]) {
            const read = (0, timer_1.readFilters)([named, "whatever"]);
            strict_1.default.equal(read.ok, false, `"${named}" was taken for a timer property`);
        }
    });
    (0, node_test_1.it)("is taken when it is a real one", () => {
        const read = (0, timer_1.readFilters)(["authorID", "user-1", "kind", "cron"]);
        strict_1.default.equal(read.ok, true);
        strict_1.default.deepEqual(read.ok && read.pairs, [
            ["authorID", "user-1"],
            ["kind", "cron"],
        ]);
    });
});
(0, node_test_1.describe)("every reader of a timer's properties", () => {
    (0, node_test_1.it)("hands back the same shapes, whichever one is asked", async () => {
        await (0, harness_1.persist)(new harness_1.Timer({
            name: "p",
            kind: harness_1.TimerKind.interval,
            code: "$testMark[data=$timerData[args]|none=$timerData[cron]]",
            duration: 60,
            args: ["first", "second"],
        }), Date.now() + 60);
        await harness.ready();
        await (0, harness_1.waitFor)(() => harness_1.marks.some((mark) => mark.startsWith("old=")), 3000);
        harness.disarm();
        const read = (prefix) => {
            const mark = harness_1.marks.find((one) => one.startsWith(prefix));
            return Object.fromEntries(mark.split("|").map((part) => part.split(/=(.*)/s).slice(0, 2)));
        };
        const event = read("old=");
        const own = read("data=");
        // an array has to survive as one, rather than flattening to "first,second"
        for (const [who, raw] of [
            ["$oldTimer", event.old],
            ["$newTimer", event.new],
            ["$timerData", own.data],
        ]) {
            strict_1.default.deepEqual(JSON.parse(raw), ["first", "second"], `${who} flattened the arguments`);
        }
        // a property this kind never has reads as nothing, not as the word "null"
        strict_1.default.equal(event.cron, "", "$timerData spelled a missing property out as null in an event");
        strict_1.default.equal(own.none, "", "$timerData spelled a missing property out as null in a timer's own code");
    });
});
//# sourceMappingURL=properties.test.js.map