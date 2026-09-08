"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const node_test_1 = require("node:test");
/** Each backend's packages, which only whoever picked that backend should have to install */
const BACKEND_PACKAGES = ["typeorm", "reflect-metadata", "@tryforge/forge.db", "@quoriel/db"];
const loaded = (pkg) => !!require.cache[require.resolve(pkg)];
(0, node_test_1.describe)("what importing the package costs", () => {
    (0, node_test_1.it)("loads no backend's dependencies until one is picked", async () => {
        await Promise.resolve().then(() => __importStar(require("..")));
        for (const pkg of BACKEND_PACKAGES) {
            strict_1.default.equal(loaded(pkg), false, `${pkg} was loaded just by importing ForgeTimers`);
        }
    });
    (0, node_test_1.it)("loads only what the chosen backend needs", async () => {
        const { Database } = await Promise.resolve().then(() => __importStar(require("../structures")));
        await Database.use("quorieldb");
        strict_1.default.equal(loaded("@quoriel/db"), true, "the picked backend must be loaded");
        strict_1.default.equal(loaded("typeorm"), false, "the other backend's ORM must stay out");
        await Database.destroy();
    });
    (0, node_test_1.it)("says what to install when a backend's packages are missing", async () => {
        const { Database } = await Promise.resolve().then(() => __importStar(require("../structures")));
        const resolve = require("module")._resolveFilename;
        require("module")._resolveFilename = function (request, ...rest) {
            if (request === "@tryforge/forge.db") {
                const err = Object.assign(new Error(`Cannot find module '${request}'`), { code: "MODULE_NOT_FOUND" });
                throw err;
            }
            return resolve.call(this, request, ...rest);
        };
        try {
            await strict_1.default.rejects(Database.open("forgedb"), /could not be opened/);
        }
        finally {
            require("module")._resolveFilename = resolve;
        }
    });
    (0, node_test_1.it)("exports the stores the loader reaches for", async () => {
        const quoriel = await Promise.resolve().then(() => __importStar(require("../structures/stores/QuorielDBStore")));
        const forge = await Promise.resolve().then(() => __importStar(require("../structures/stores/ForgeDBStore")));
        // renaming either class without the loader would only show up at boot
        strict_1.default.equal(typeof quoriel.QuorielDBStore, "function", "QuorielDBStore is what load() constructs");
        strict_1.default.equal(typeof forge.ForgeDBStore, "function", "ForgeDBStore is what load() constructs");
    });
});
//# sourceMappingURL=lazy.test.js.map