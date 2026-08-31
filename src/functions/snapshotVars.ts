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

/**
 * Rewrites a value into something JSON can hold without losing its type.
 * @param value The value to encode.
 * @param seen The objects currently being walked, to break cycles.
 * @returns
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
            return { ok: true, value: { [TAG]: "bigint", value: value.toString() } }
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
        if (obj instanceof Date) {
            return Number.isFinite(obj.getTime()) ? { ok: true, value: { [TAG]: "date", value: obj.toISOString() } } : FAILED
        }

        if (obj instanceof RegExp) {
            return { ok: true, value: { [TAG]: "regexp", value: { source: obj.source, flags: obj.flags } } }
        }

        if (obj instanceof Map) {
            const entries: unknown[] = []
            for (const [key, item] of obj) {
                const encodedKey = encode(key, seen, `${path}<key>`, dropped)
                const encodedItem = encode(item, seen, `${path}<value>`, dropped)
                if (encodedKey.ok && encodedItem.ok) entries.push([encodedKey.value, encodedItem.value])
            }
            return { ok: true, value: { [TAG]: "map", value: entries } }
        }

        if (obj instanceof Set) {
            const items: unknown[] = []
            for (const item of obj) {
                const encoded = encode(item, seen, `${path}<item>`, dropped)
                if (encoded.ok) items.push(encoded.value)
            }
            return { ok: true, value: { [TAG]: "set", value: items } }
        }

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
 * @returns
 */
function decode(value: unknown): unknown {
    if (value === null || typeof value !== "object") return value

    if (Array.isArray(value)) return value.map(decode)

    const obj = value as Record<string, unknown>
    if (!isTagged(obj)) {
        const out: Record<string, unknown> = {}
        for (const [key, item] of Object.entries(obj)) out[key] = decode(item)
        return out
    }

    const inner = obj.value

    switch (obj[TAG]) {
        case "raw": {
            // the payload's tag key is user data, not ours
            const out: Record<string, unknown> = {}
            for (const [key, item] of Object.entries(inner as Record<string, unknown>)) out[key] = decode(item)
            return out
        }
        case "bigint":
            return BigInt(inner as string)
        case "date":
            return new Date(inner as string)
        case "regexp": {
            const { source, flags } = inner as { source: string; flags: string }
            return new RegExp(source, flags)
        }
        case "map":
            return new Map((inner as [unknown, unknown][]).map(([k, v]) => [decode(k), decode(v)]))
        case "set":
            return new Set((inner as unknown[]).map(decode))
        default:
            return undefined
    }
}

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

    const localFunctions: Record<string, IPersistedLocalFunction> = {}
    for (const [fnName, data] of Object.entries(runtime.localFunctions ?? {})) {
        localFunctions[fnName] = { code: data.code.rawValue, args: data.args }
    }

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
 * @returns
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
            Logger.error(err)
        }
    }

    return out
}