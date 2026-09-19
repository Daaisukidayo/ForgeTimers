"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
const harness_1 = require("./support/harness");
const __1 = require("..");
const types_1 = require("../types");
(0, harness_1.useTempHome)("forgetimers-storage");
/** Subscribed before attach(), which is what calls init() and opens the storage */
function watching(ext, event) {
    const seen = [];
    ext.emitter.on(event, (payload) => seen.push(payload));
    return seen;
}
/**
 * The failure comes first on purpose: blocking forge.db only bites while ForgeDBStore is still
 * uncached, and opening the storage even once would warm it for the rest of the file.
 */
(0, node_test_1.describe)("the storage being opened", () => {
    (0, node_test_1.it)("reports one it could not open, and why", async () => {
        const resolve = require("module")._resolveFilename;
        require("module")._resolveFilename = function (request, ...rest) {
            if (request === "@tryforge/forge.db") {
                throw Object.assign(new Error(`Cannot find module '${request}'`), { code: "MODULE_NOT_FOUND" });
            }
            return resolve.call(this, request, ...rest);
        };
        const ext = new __1.ForgeTimers();
        const connected = watching(ext, types_1.TimerEvent.databaseConnect);
        const failed = watching(ext, types_1.TimerEvent.databaseFail);
        const harness = (0, harness_1.attach)(ext);
        try {
            strict_1.default.equal(await harness.ext.ready, false, "a missing backend must not reject the boot");
            strict_1.default.deepEqual(connected, [], "nothing opened, so nothing may say it did");
            strict_1.default.equal(failed.length, 1, "the failure went unreported");
            const reason = failed[0].event?.failReason;
            strict_1.default.match(`${reason}`, /could not be opened/, `no reason given: ${reason}`);
        }
        finally {
            require("module")._resolveFilename = resolve;
            harness.disarm();
        }
    });
    (0, node_test_1.it)("reports that it opened", async () => {
        const ext = new __1.ForgeTimers();
        const connected = watching(ext, types_1.TimerEvent.databaseConnect);
        const failed = watching(ext, types_1.TimerEvent.databaseFail);
        const harness = (0, harness_1.attach)(ext);
        try {
            strict_1.default.equal(await harness.ext.ready, true);
            strict_1.default.equal(connected.length, 1, "the open went unreported");
            strict_1.default.deepEqual(failed, [], "nothing failed, so nothing may say so");
        }
        finally {
            harness.disarm();
        }
    });
});
//# sourceMappingURL=storage.test.js.map