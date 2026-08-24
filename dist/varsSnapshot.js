"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.snapshotVars = snapshotVars;
exports.rehydrateLocalFunctions = rehydrateLocalFunctions;
const forgescript_1 = require("@tryforge/forgescript");
function isPlain(value, seen) {
    if (value === null)
        return true;
    const type = typeof value;
    if (type === "string" || type === "number" || type === "boolean") {
        return type !== "number" || Number.isFinite(value);
    }
    if (type !== "object")
        return false;
    const obj = value;
    if (seen.has(obj))
        return false; // circular
    seen.add(obj);
    try {
        if (Array.isArray(obj))
            return obj.every((item) => isPlain(item, seen));
        // only object literals / null-prototype objects
        const proto = Object.getPrototypeOf(obj);
        if (proto !== Object.prototype && proto !== null)
            return false;
        return Object.values(obj).every((item) => isPlain(item, seen));
    }
    finally {
        seen.delete(obj);
    }
}
/** Keeps the JSON-safe entries of a record, reporting the keys it dropped */
function filterPlain(source) {
    const kept = {};
    const dropped = [];
    for (const [key, value] of Object.entries(source)) {
        if (isPlain(value, new WeakSet()))
            kept[key] = structuredClone(value);
        else
            dropped.push(key);
    }
    return { kept, dropped };
}
function snapshotVars(runtime, label) {
    const keywords = filterPlain(runtime.keywords ?? {});
    const environment = filterPlain(runtime.environment ?? {});
    const localFunctions = {};
    for (const [fnName, data] of Object.entries(runtime.localFunctions ?? {})) {
        localFunctions[fnName] = { code: data.code.rawValue, args: data.args };
    }
    const dropped = [...keywords.dropped, ...environment.dropped];
    if (dropped.length) {
        forgescript_1.Logger.warn(`${label} | Not persisting non-serializable variables: ${dropped.join(", ")}`);
    }
    return {
        keywords: keywords.kept,
        environment: environment.kept,
        localFunctions,
    };
}
/** Rebuilds `localFunctions` by recompiling each stored source */
function rehydrateLocalFunctions(stored, path, label) {
    const out = {};
    if (!stored)
        return out;
    for (const [fnName, data] of Object.entries(stored)) {
        try {
            const compiled = forgescript_1.Compiler.compile(data.code, path);
            out[fnName] = {
                args: data.args,
                code: {
                    value: compiled.code,
                    rawValue: data.code,
                    functions: compiled.functions,
                    resolve: compiled.resolve,
                },
            };
        }
        catch (err) {
            forgescript_1.Logger.warn(`${label} | Dropping local function "${fnName}": failed to recompile`);
            forgescript_1.Logger.error(err);
        }
    }
    return out;
}
//# sourceMappingURL=varsSnapshot.js.map