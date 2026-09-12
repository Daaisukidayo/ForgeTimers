import { Compiler, IExtendedCompiledFunctionField, ILocalFunctionData } from "@tryforge/forgescript"
import { Logger } from "./logger"

export interface IPersistedLocalFunction {
    code: string
    args: string[]
}

export interface IPersistedVars {
    keywords?: Record<string, unknown>
    environment?: Record<string, unknown>
    localFunctions?: Record<string, IPersistedLocalFunction>
}

/** v0 was plain json. v1 tags dates, maps, sets, regexps and bigints, and drops per value instead of per key */
export const VARS_SCHEMA_VERSION = 1

const TAG = "$forge"

interface ITagged {
    [TAG]: string
    value: unknown
}

function isTagged(value: object): value is ITagged {
    return TAG in value
}

function isPlainObject(value: object) {
    const proto = Object.getPrototypeOf(value)
    return proto === Object.prototype || proto === null
}

type Encoded = { ok: true; value: unknown } | { ok: false }

const FAILED: Encoded = { ok: false }

/** Encodes a nested value, tracking where it sat for the dropped-variable log */
type Walk = (value: unknown, suffix: string) => Encoded

/** Nothing nested to encode, for the codecs that hold a single value */
const NO_WALK: Walk = () => FAILED

interface ICodec {
    /** Recognises the values this codec owns */
    test(value: unknown): boolean
    /** What to store under the tag, or FAILED when the value cannot be held */
    encode(value: never, walk: Walk): Encoded
    /** Rebuilds the value from what was stored */
    decode(payload: unknown): unknown
}

/** Both halves of every tagged type live together, so adding one is a single entry */
const CODECS: Record<string, ICodec> = {
    bigint: {
        test: (value) => typeof value === "bigint",
        encode: (value: bigint) => ({ ok: true, value: value.toString() }),
        decode: (payload) => BigInt(payload as string),
    },
    date: {
        test: (value) => value instanceof Date,
        encode: (value: Date) => (Number.isFinite(value.getTime()) ? { ok: true, value: value.toISOString() } : FAILED),
        decode: (payload) => new Date(payload as string),
    },
    regexp: {
        test: (value) => value instanceof RegExp,
        encode: (value: RegExp) => ({ ok: true, value: { source: value.source, flags: value.flags } }),
        decode: (payload) => {
            const { source, flags } = payload as { source: string; flags: string }
            return new RegExp(source, flags)
        },
    },
    map: {
        test: (value) => value instanceof Map,
        encode: (value: Map<unknown, unknown>, walk) => {
            const entries: unknown[] = []

            for (const [key, item] of value) {
                const encodedKey = walk(key, "<key>")
                const encodedItem = walk(item, "<value>")
                if (encodedKey.ok && encodedItem.ok) entries.push([encodedKey.value, encodedItem.value])
            }

            return { ok: true, value: entries }
        },
        decode: (payload) =>
            new Map((payload as [unknown, unknown][]).map(([key, item]) => [decode(key), decode(item)])),
    },
    set: {
        test: (value) => value instanceof Set,
        encode: (value: Set<unknown>, walk) => {
            const items: unknown[] = []

            for (const item of value) {
                const encoded = walk(item, "<item>")
                if (encoded.ok) items.push(encoded.value)
            }

            return { ok: true, value: items }
        },
        decode: (payload) => new Set((payload as unknown[]).map(decode)),
    },
}

/** Runs one codec and wraps what it produced in its envelope */
function applyCodec(tag: string, value: unknown, walk: Walk): Encoded {
    const payload = CODECS[tag].encode(value as never, walk)
    return payload.ok ? { ok: true, value: { [TAG]: tag, value: payload.value } } : FAILED
}

/**
 * Rewrites a value into something JSON can hold without losing its type.
 * @param value The value to encode.
 * @param seen The objects currently being walked, to break cycles.
 */
function encode(value: unknown, seen: WeakSet<object>, path: string, dropped: string[]): Encoded {
    if (value === null) return { ok: true, value: null }

    switch (typeof value) {
        case "string":
        case "boolean":
            return { ok: true, value }
        case "number":
            if (Number.isFinite(value)) return { ok: true, value }
            dropped.push(`${path} (${String(value)})`)
            return FAILED
        case "bigint":
            return applyCodec("bigint", value, NO_WALK)
        case "object":
            break
        default:
            dropped.push(`${path} (${typeof value})`)
            return FAILED
    }

    const obj = value as object
    if (seen.has(obj)) {
        dropped.push(`${path} (circular)`)
        return FAILED
    }
    seen.add(obj)

    try {
        const tag = Object.keys(CODECS).find((name) => CODECS[name].test(obj))
        if (tag) return applyCodec(tag, obj, (item, suffix) => encode(item, seen, `${path}${suffix}`, dropped))

        if (Array.isArray(obj)) {
            // null instead of dropping, otherwise every index after it shifts
            return {
                ok: true,
                value: obj.map((item, index) => {
                    const encoded = encode(item, seen, `${path}[${index}]`, dropped)
                    return encoded.ok ? encoded.value : null
                }),
            }
        }

        if (!isPlainObject(obj)) {
            dropped.push(`${path} (${obj.constructor?.name ?? "object"})`)
            return FAILED
        }

        const out: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(obj)) {
            const encoded = encode(item, seen, `${path}.${key}`, dropped)
            if (encoded.ok) out[key] = encoded.value
        }

        // user object with our tag key would read back as an envelope, so wrap it
        return { ok: true, value: isTagged(obj) ? { [TAG]: "raw", value: out } : out }
    } finally {
        seen.delete(obj)
    }
}

/**
 * Rebuilds a value written by {@link encode}.
 * @param value The stored value.
 */
function decode(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value

    if (Array.isArray(value)) return value.map(decode)

    const obj = value as Record<string, unknown>
    if (!isTagged(obj)) return decodeEntries(obj)

    const inner = obj.value

    // the payload's tag key is user data, not ours
    if (obj[TAG] === "raw") return decodeEntries(inner as Record<string, unknown>)

    // an unknown tag was written by a build that knows more than this one
    return CODECS[obj[TAG]]?.decode(inner)
}

const decodeEntries = (obj: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(obj).map(([key, item]) => [key, decode(item)]))

function encodeRecord(source: Record<string, unknown>) {
    const kept: Record<string, unknown> = {}
    const dropped: string[] = []

    for (const [key, value] of Object.entries(source)) {
        const before = dropped.length
        const encoded = encode(value, new WeakSet(), key, dropped)

        if (encoded.ok) kept[key] = encoded.value
        else if (dropped.length === before) dropped.push(key)
    }

    return { kept, dropped }
}

export function snapshotVars(
    runtime: {
        keywords?: Record<string, unknown>
        environment?: Record<string, unknown>
        localFunctions?: Record<string, ILocalFunctionData>
    },
    label: string
): IPersistedVars {
    const keywords = encodeRecord(runtime.keywords ?? {})
    const environment = encodeRecord(runtime.environment ?? {})

    const localFunctions = Object.fromEntries(
        Object.entries(runtime.localFunctions ?? {}).map(([fnName, data]) => [
            fnName,
            { code: data.code.rawValue, args: data.args } satisfies IPersistedLocalFunction,
        ])
    )

    const dropped = [...keywords.dropped, ...environment.dropped]
    if (dropped.length) {
        Logger.warn(`${label} | Not persisting non-serializable variables: ${dropped.join(", ")}`)
    }

    return {
        keywords: keywords.kept,
        environment: environment.kept,
        localFunctions,
    }
}

/**
 * Reads back a record written by {@link snapshotVars}.
 * @param source The stored record.
 * @param version The schema the timer was written under.
 */
export function restoreVars(source: Record<string, unknown> | undefined, version: number) {
    if (!source) return {}
    // v0 predates the envelope, it's already plain json
    if (version < 1) return { ...source }

    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(source)) {
        const decoded = decode(value)
        if (decoded !== undefined) out[key] = decoded
    }

    return out
}

/** Rebuilds `localFunctions` by recompiling each stored code. */
export function rehydrateLocalFunctions(
    stored: Record<string, IPersistedLocalFunction> | undefined,
    path: string | null | undefined,
    label: string
): Record<string, ILocalFunctionData> {
    const out: Record<string, ILocalFunctionData> = {}
    if (!stored) return out

    for (const [fnName, data] of Object.entries(stored)) {
        try {
            const compiled = Compiler.compile(data.code, path)
            out[fnName] = {
                args: data.args,
                code: {
                    value: compiled.code,
                    rawValue: data.code,
                    functions: compiled.functions,
                    resolve: compiled.resolve,
                } as IExtendedCompiledFunctionField,
            }
        } catch (err) {
            Logger.warn(`${label} | Dropping local function "${fnName}": failed to recompile`)
            Logger.untagged(err)
        }
    }

    return out
}
