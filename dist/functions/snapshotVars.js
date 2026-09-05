"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VARS_SCHEMA_VERSION = void 0;
exports.snapshotVars = snapshotVars;
exports.restoreVars = restoreVars;
exports.rehydrateLocalFunctions = rehydrateLocalFunctions;
const forgescript_1 = require("@tryforge/forgescript");
const logger_1 = require("./logger");
/** v0 was plain json. v1 tags dates, maps, sets, regexps and bigints, and drops per value instead of per key */
exports.VARS_SCHEMA_VERSION = 1;
const TAG = "$forge";
function isTagged(value) {
    return TAG in value;
}
function isPlainObject(value) {
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
const FAILED = { ok: false };
/**
 * Rewrites a value into something JSON can hold without losing its type.
 * @param value The value to encode.
 * @param seen The objects currently being walked, to break cycles.
 */
function encode(value, seen, path, dropped) {
    if (value === null)
        return { ok: true, value: null };
    switch (typeof value) {
        case "string":
        case "boolean":
            return { ok: true, value };
        case "number":
            if (Number.isFinite(value))
                return { ok: true, value };
            dropped.push(`${path} (${String(value)})`);
            return FAILED;
        case "bigint":
            return { ok: true, value: { [TAG]: "bigint", value: value.toString() } };
        case "object":
            break;
        default:
            dropped.push(`${path} (${typeof value})`);
            return FAILED;
    }
    const obj = value;
    if (seen.has(obj)) {
        dropped.push(`${path} (circular)`);
        return FAILED;
    }
    seen.add(obj);
    try {
        if (obj instanceof Date) {
            return Number.isFinite(obj.getTime()) ? { ok: true, value: { [TAG]: "date", value: obj.toISOString() } } : FAILED;
        }
        if (obj instanceof RegExp) {
            return { ok: true, value: { [TAG]: "regexp", value: { source: obj.source, flags: obj.flags } } };
        }
        if (obj instanceof Map) {
            const entries = [];
            for (const [key, item] of obj) {
                const encodedKey = encode(key, seen, `${path}<key>`, dropped);
                const encodedItem = encode(item, seen, `${path}<value>`, dropped);
                if (encodedKey.ok && encodedItem.ok)
                    entries.push([encodedKey.value, encodedItem.value]);
            }
            return { ok: true, value: { [TAG]: "map", value: entries } };
        }
        if (obj instanceof Set) {
            const items = [];
            for (const item of obj) {
                const encoded = encode(item, seen, `${path}<item>`, dropped);
                if (encoded.ok)
                    items.push(encoded.value);
            }
            return { ok: true, value: { [TAG]: "set", value: items } };
        }
        if (Array.isArray(obj)) {
            // null instead of dropping, otherwise every index after it shifts
            return {
                ok: true,
                value: obj.map((item, index) => {
                    const encoded = encode(item, seen, `${path}[${index}]`, dropped);
                    return encoded.ok ? encoded.value : null;
                }),
            };
        }
        if (!isPlainObject(obj)) {
            dropped.push(`${path} (${obj.constructor?.name ?? "object"})`);
            return FAILED;
        }
        const out = {};
        for (const [key, item] of Object.entries(obj)) {
            const encoded = encode(item, seen, `${path}.${key}`, dropped);
            if (encoded.ok)
                out[key] = encoded.value;
        }
        // user object with our tag key would read back as an envelope, so wrap it
        return { ok: true, value: isTagged(obj) ? { [TAG]: "raw", value: out } : out };
    }
    finally {
        seen.delete(obj);
    }
}
/**
 * Rebuilds a value written by {@link encode}.
 * @param value The stored value.
 */
function decode(value) {
    if (value === null || typeof value !== "object")
        return value;
    if (Array.isArray(value))
        return value.map(decode);
    const obj = value;
    if (!isTagged(obj))
        return decodeEntries(obj);
    const inner = obj.value;
    switch (obj[TAG]) {
        case "raw":
            // the payload's tag key is user data, not ours
            return decodeEntries(inner);
        case "bigint":
            return BigInt(inner);
        case "date":
            return new Date(inner);
        case "regexp": {
            const { source, flags } = inner;
            return new RegExp(source, flags);
        }
        case "map":
            return new Map(inner.map(([k, v]) => [decode(k), decode(v)]));
        case "set":
            return new Set(inner.map(decode));
        default:
            return undefined;
    }
}
const decodeEntries = (obj) => Object.fromEntries(Object.entries(obj).map(([key, item]) => [key, decode(item)]));
function encodeRecord(source) {
    const kept = {};
    const dropped = [];
    for (const [key, value] of Object.entries(source)) {
        const before = dropped.length;
        const encoded = encode(value, new WeakSet(), key, dropped);
        if (encoded.ok)
            kept[key] = encoded.value;
        else if (dropped.length === before)
            dropped.push(key);
    }
    return { kept, dropped };
}
function snapshotVars(runtime, label) {
    const keywords = encodeRecord(runtime.keywords ?? {});
    const environment = encodeRecord(runtime.environment ?? {});
    const localFunctions = Object.fromEntries(Object.entries(runtime.localFunctions ?? {}).map(([fnName, data]) => [
        fnName,
        { code: data.code.rawValue, args: data.args },
    ]));
    const dropped = [...keywords.dropped, ...environment.dropped];
    if (dropped.length) {
        logger_1.Logger.warn(`${label} | Not persisting non-serializable variables: ${dropped.join(", ")}`);
    }
    return {
        keywords: keywords.kept,
        environment: environment.kept,
        localFunctions,
    };
}
/**
 * Reads back a record written by {@link snapshotVars}.
 * @param source The stored record.
 * @param version The schema the timer was written under.
 */
function restoreVars(source, version) {
    if (!source)
        return {};
    // v0 predates the envelope, it's already plain json
    if (version < 1)
        return { ...source };
    const out = {};
    for (const [key, value] of Object.entries(source)) {
        const decoded = decode(value);
        if (decoded !== undefined)
            out[key] = decoded;
    }
    return out;
}
/** Rebuilds `localFunctions` by recompiling each stored code. */
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
            logger_1.Logger.warn(`${label} | Dropping local function "${fnName}": failed to recompile`);
            logger_1.Logger.untagged(err);
        }
    }
    return out;
}
//# sourceMappingURL=snapshotVars.js.map