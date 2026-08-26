import { Compiler, IExtendedCompiledFunctionField, ILocalFunctionData, Logger } from "@tryforge/forgescript"

export interface IPersistedLocalFunction {
    code: string
    args: string[]
}

export interface IPersistedVars {
    keywords?: Record<string, unknown>
    environment?: Record<string, unknown>
    localFunctions?: Record<string, IPersistedLocalFunction>
}

function isPlain(value: unknown, seen: WeakSet<object>): boolean {
    if (value === null) return true

    const type = typeof value
    if (type === "string" || type === "number" || type === "boolean") {
        return type !== "number" || Number.isFinite(value)
    }
    if (type !== "object") return false

    const obj = value as object
    if (seen.has(obj)) return false
    seen.add(obj)

    try {
        if (Array.isArray(obj)) return obj.every((item) => isPlain(item, seen))

        // only object literals / null-prototype objects
        const proto = Object.getPrototypeOf(obj)
        if (proto !== Object.prototype && proto !== null) return false

        return Object.values(obj).every((item) => isPlain(item, seen))
    } finally {
        seen.delete(obj)
    }
}

/** Keeps the JSON-safe entries of a record, reporting the keys it dropped */
function filterPlain(source: Record<string, unknown>): { kept: Record<string, unknown>; dropped: string[] } {
    const kept: Record<string, unknown> = {}
    const dropped: string[] = []

    for (const [key, value] of Object.entries(source)) {
        if (isPlain(value, new WeakSet())) kept[key] = JSON.parse(JSON.stringify(value))
        else dropped.push(key)
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
    const keywords = filterPlain(runtime.keywords ?? {})
    const environment = filterPlain(runtime.environment ?? {})

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