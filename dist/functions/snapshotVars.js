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
/** Nothing nested to encode, for the codecs that hold a single value */
const NO_WALK = () => FAILED;
/** Both halves of every tagged type live together, so adding one is a single entry */
const CODECS = {
    bigint: {
        test: (value) => typeof value === "bigint",
        encode: (value) => ({ ok: true, value: value.toString() }),
        decode: (payload) => BigInt(payload),
    },
    date: {
        test: (value) => value instanceof Date,
        encode: (value) => (Number.isFinite(value.getTime()) ? { ok: true, value: value.toISOString() } : FAILED),
        decode: (payload) => new Date(payload),
    },
    regexp: {
        test: (value) => value instanceof RegExp,
        encode: (value) => ({ ok: true, value: { source: value.source, flags: value.flags } }),
        decode: (payload) => {
            const { source, flags } = payload;
            return new RegExp(source, flags);
        },
    },
    map: {
        test: (value) => value instanceof Map,
        encode: (value, walk) => {
            const entries = [];
            for (const [key, item] of value) {
                const encodedKey = walk(key, "<key>");
                const encodedItem = walk(item, "<value>");
                if (encodedKey.ok && encodedItem.ok)
                    entries.push([encodedKey.value, encodedItem.value]);
            }
            return { ok: true, value: entries };
        },
        decode: (payload) => new Map(payload.map(([key, item]) => [decode(key), decode(item)])),
    },
    set: {
        test: (value) => value instanceof Set,
        encode: (value, walk) => {
            const items = [];
            for (const item of value) {
                const encoded = walk(item, "<item>");
                if (encoded.ok)
                    items.push(encoded.value);
            }
            return { ok: true, value: items };
        },
        decode: (payload) => new Set(payload.map(decode)),
    },
};
/** Runs one codec and wraps what it produced in its envelope */
function applyCodec(tag, value, walk) {
    const payload = CODECS[tag].encode(value, walk);
    return payload.ok ? { ok: true, value: { [TAG]: tag, value: payload.value } } : FAILED;
}
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
            return applyCodec("bigint", value, NO_WALK);
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
        const tag = Object.keys(CODECS).find((name) => CODECS[name].test(obj));
        if (tag)
            return applyCodec(tag, obj, (item, suffix) => encode(item, seen, `${path}${suffix}`, dropped));
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
    // the payload's tag key is user data, not ours
    if (obj[TAG] === "raw")
        return decodeEntries(inner);
    // an unknown tag was written by a build that knows more than this one
    return CODECS[obj[TAG]]?.decode(inner);
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