"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistenceSuite = persistenceSuite;
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./harness");
const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
const sample = () => new harness_1.Timer({
    name: "reminder",
    kind: harness_1.TimerKind.timeout,
    code: "$sendMessage[$channelID;now]",
    duration: NINETY_DAYS,
    channelID: "chan-1",
    guildID: "guild-1",
    hostID: "user-1",
    messageID: "msg-1",
    args: ["first", "second"],
    vars: { keywords: { k: "v" }, environment: { n: 1, nested: { deep: true } }, localFunctions: {} },
});
function persistenceSuite(target) {
    if (!(0, harness_1.connectionFor)(target)) {
        (0, node_test_1.describe)(`persistence on ${target}`, () => {
            (0, node_test_1.it)(`requires ${harness_1.DATABASE_ENV[target]}`, { skip: true }, () => undefined);
        });
        return;
    }
    (0, node_test_1.describe)(`persistence on ${target}`, () => {
        let harness;
        (0, node_test_1.before)(async () => (harness = await (0, harness_1.boot)({}, target)));
        (0, node_test_1.beforeEach)(async () => await harness_1.Database.wipe());
        (0, node_test_1.after)(async () => {
            harness.disarm();
            await harness.cleanup();
        });
        (0, node_test_1.it)("round-trips every column", async () => {
            const original = sample();
            await harness_1.Database.set(original);
            const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder");
            strict_1.default.ok(back);
            strict_1.default.equal(back.id, "timeout:reminder");
            strict_1.default.equal(back.name, "reminder");
            strict_1.default.equal(back.kind, harness_1.TimerKind.timeout);
            strict_1.default.equal(back.code, "$sendMessage[$channelID;now]");
            strict_1.default.equal(back.channelID, "chan-1");
            strict_1.default.equal(back.guildID, "guild-1");
            strict_1.default.equal(back.hostID, "user-1");
            strict_1.default.equal(back.messageID, "msg-1");
            strict_1.default.deepEqual(back.args, ["first", "second"]);
            strict_1.default.deepEqual(back.vars, original.vars);
        });
        (0, node_test_1.it)("keeps epoch timestamps intact instead of overflowing an int32", async () => {
            const original = sample();
            await harness_1.Database.set(original);
            const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder");
            strict_1.default.equal(typeof back.duration, "number");
            strict_1.default.equal(typeof back.fireAt, "number");
            strict_1.default.equal(typeof back.timestamp, "number");
            strict_1.default.equal(back.duration, NINETY_DAYS);
            strict_1.default.equal(back.fireAt, original.fireAt);
            strict_1.default.equal(back.timestamp, original.timestamp);
            strict_1.default.ok(back.fireAt > 2 ** 31);
        });
        (0, node_test_1.it)("hydrates into a Timer, not a plain row", async () => {
            await harness_1.Database.set(sample());
            const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "reminder");
            strict_1.default.ok(back instanceof harness_1.Timer);
            strict_1.default.ok(back.timeLeft() > 0);
            strict_1.default.equal(back.isOverdue(), false);
        });
        (0, node_test_1.it)("keeps a timeout and an interval of the same name apart", async () => {
            await harness_1.Database.set(new harness_1.Timer({ name: "shared", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "c" }));
            await harness_1.Database.set(new harness_1.Timer({ name: "shared", kind: harness_1.TimerKind.interval, duration: 2000, channelID: "c" }));
            strict_1.default.equal((await harness_1.Database.getAll()).length, 2);
            strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.timeout, "shared")).duration, 1000);
            strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.interval, "shared")).duration, 2000);
        });
        (0, node_test_1.it)("overwrites a timer reused under the same name", async () => {
            await harness_1.Database.set(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, duration: 1000, channelID: "c" }));
            await harness_1.Database.set(new harness_1.Timer({ name: "n", kind: harness_1.TimerKind.timeout, duration: 5000, channelID: "c" }));
            strict_1.default.equal((await harness_1.Database.getAll()).length, 1);
            strict_1.default.equal((await harness_1.Database.get(harness_1.TimerKind.timeout, "n")).duration, 5000);
        });
        (0, node_test_1.it)("filters by kind and by arbitrary fields", async () => {
            await harness_1.Database.set(new harness_1.Timer({ name: "a", kind: harness_1.TimerKind.timeout, duration: 1, channelID: "c", guildID: "g1" }));
            await harness_1.Database.set(new harness_1.Timer({ name: "b", kind: harness_1.TimerKind.interval, duration: 1, channelID: "c", guildID: "g1" }));
            await harness_1.Database.set(new harness_1.Timer({ name: "c", kind: harness_1.TimerKind.interval, duration: 1, channelID: "c", guildID: "g2" }));
            strict_1.default.equal((await harness_1.Database.getAllOf(harness_1.TimerKind.interval)).length, 2);
            strict_1.default.equal((await harness_1.Database.getAllOf(harness_1.TimerKind.timeout)).length, 1);
            strict_1.default.equal((await harness_1.Database.find({ guildID: "g1" })).length, 2);
            strict_1.default.equal((await harness_1.Database.find({ guildID: "g2" }, 1)).length, 1);
        });
        (0, node_test_1.it)("deletes one timer and wipes the rest", async () => {
            await harness_1.Database.set(new harness_1.Timer({ name: "a", kind: harness_1.TimerKind.timeout, duration: 1, channelID: "c" }));
            await harness_1.Database.set(new harness_1.Timer({ name: "b", kind: harness_1.TimerKind.timeout, duration: 1, channelID: "c" }));
            await harness_1.Database.delete(harness_1.TimerKind.timeout, "a");
            strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "a"), null);
            strict_1.default.equal((await harness_1.Database.getAll()).length, 1);
            await harness_1.Database.wipe();
            strict_1.default.equal((await harness_1.Database.getAll()).length, 0);
        });
        (0, node_test_1.it)("stores a name of the maximum allowed length", async () => {
            const name = "x".repeat(harness_1.Timer.maxNameLength(harness_1.TimerKind.timeout));
            await harness_1.Database.set(new harness_1.Timer({ name, kind: harness_1.TimerKind.timeout, duration: 1, channelID: "c" }));
            strict_1.default.ok(await harness_1.Database.get(harness_1.TimerKind.timeout, name));
        });
        (0, node_test_1.it)("returns null for a timer that was never stored", async () => {
            strict_1.default.equal(await harness_1.Database.get(harness_1.TimerKind.timeout, "no such timer"), null);
        });
        (0, node_test_1.it)("stores null for the optional columns", async () => {
            await harness_1.Database.set(new harness_1.Timer({ name: "bare", kind: harness_1.TimerKind.timeout, duration: 1, channelID: "c" }));
            const back = await harness_1.Database.get(harness_1.TimerKind.timeout, "bare");
            strict_1.default.equal(back.guildID, null);
            strict_1.default.equal(back.hostID, null);
            strict_1.default.equal(back.messageID, null);
            strict_1.default.equal(back.path, null);
        });
    });
}
//# sourceMappingURL=databases.js.map