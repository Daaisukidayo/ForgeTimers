import { DataBaseManager } from "@tryforge/forge.db"
import { ArgType, Compiler, Context, FunctionManager, ForgeClient, Interpreter, NativeFunction } from "@tryforge/forgescript"
import { mkdtempSync, rmSync } from "node:fs"
import { DataSource } from "typeorm"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ForgeTimers } from ".."
import { Database, Timer, TimerKind } from "../structures"

class ConfigSeed extends DataBaseManager {
    public database = "seed"
    public entityManager = { sqlite: [], mongodb: [], mysql: [], postgres: [] }
}

export type TestDatabase = "sqlite" | "postgres" | "mysql" | "mongodb"

export type TestConnection =
    | { type: "better-sqlite3"; folder: string }
    | { type: "postgres" | "mysql" | "mongodb"; url: string }

export const DATABASE_ENV: Record<Exclude<TestDatabase, "sqlite">, string> = {
    postgres: "FORGETIMERS_TEST_POSTGRES",
    mysql: "FORGETIMERS_TEST_MYSQL",
    mongodb: "FORGETIMERS_TEST_MONGODB",
}

export function connectionFor(target: TestDatabase): TestConnection | null {
    if (target === "sqlite") {
        return { type: "better-sqlite3", folder: mkdtempSync(join(tmpdir(), "forgetimers-test-")) }
    }

    const url = process.env[DATABASE_ENV[target]]
    if (!url) return null

    return { type: target, url }
}

export interface IFakeTarget {
    id?: string
    channel?: { id: string; partial?: boolean } | null
    guild?: { id: string } | null
    author?: { id: string } | null
}

export interface ITestClient {
    client: any
    ext: ForgeTimers

    channels: Map<string, unknown>
    fetches: { channels: number }
    commands: unknown[]

    channelError?: unknown

    guilds: Set<string>

    ready(): Promise<void>

    disarm(): void
}

let seeded = false

export const marks: string[] = []

let markRegistered = false

function registerMark() {
    if (markRegistered) return
    markRegistered = true

    FunctionManager.add(
        new NativeFunction({
            name: "$testMark",
            version: "1.0.0",
            description: "Records that this point was reached, for the test suite",
            unwrap: true,
            brackets: true,
            args: [{ name: "label", description: "What to record", rest: false, required: true, type: ArgType.String }],
            execute(_ctx, [label]) {
                marks.push(label as string)
                return this.success()
            },
        })
    )
}

function withoutLingeringWatchdog<T>(fn: () => T): T {
    const real = globalThis.setTimeout
    globalThis.setTimeout = ((handler: never, ms?: number, ...rest: never[]) => {
        const handle = real(handler, ms as never, ...rest)
        if ((ms ?? 0) >= 10_000) handle.unref?.()
        return handle
    }) as typeof globalThis.setTimeout

    try {
        return fn()
    } finally {
        globalThis.setTimeout = real
    }
}

export async function boot(
    options: ConstructorParameters<typeof ForgeTimers>[0] = {},
    target: TestDatabase = "sqlite"
) {
    const connection = connectionFor(target)
    if (!connection) throw new Error(`${DATABASE_ENV[target as Exclude<TestDatabase, "sqlite">]} is not set`)

    const folder = "folder" in connection ? connection.folder : undefined
    if (!seeded) {
        new ConfigSeed(connection as never)
        seeded = true
    }

    const ext = new ForgeTimers(options)
    const channels = new Map<string, unknown>()
    const guilds = new Set<string>()
    const handlers: Array<() => unknown> = []

    const fetches = { channels: 0 }

    const harness: ITestClient = {
        ext,
        channels,
        fetches,
        commands: [],
        guilds,
        client: undefined,
        async ready() {
            for (const handler of handlers) await handler()
        },
        disarm() {
            for (const map of [harness.client.timeouts, harness.client.intervals]) {
                for (const handle of map.values()) clearTimeout(handle)
                map.clear()
            }
        },
    }

    harness.client = {

        options: {},
        canRespondToBots: () => true,
        timeouts: new Map<string, NodeJS.Timeout>(),
        intervals: new Map<string, NodeJS.Timeout>(),
        shard: null,
        guilds: { cache: { has: (id: string) => guilds.has(id), get: (id: string) => undefined } },
        users: { fetch: async () => null },
        channels: {
            fetch: async (id: string) => {
                fetches.channels++
                if (harness.channelError) throw harness.channelError
                return channels.get(id) ?? null
            },
        },
        commands: { toArray: () => harness.commands },
        getExtension: () => ext,
        once: (_event: string, handler: () => unknown) => handlers.push(handler),
    }

    withoutLingeringWatchdog(() => ext.init(harness.client as unknown as ForgeClient))
    FunctionManager.loadNative()
    registerMark()

    await ext.ready
    await Database.wipe().catch(() => undefined)

    async function cleanup() {
        await Database.wipe().catch(() => undefined)

        const source = (Database as unknown as { db?: DataSource }).db
        if (source?.isInitialized) await source.destroy()

        if (!folder) return

        try {
            rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
        } catch {
            void 0
        }
    }

    return Object.assign(harness, { folder, cleanup })
}

export async function run(harness: ITestClient, code: string, target: IFakeTarget = { channel: { id: "chan-1" } }) {
    return await Interpreter.run(
        new Context({
            client: harness.client,
            data: Compiler.compile(code),
            command: null,
            obj: target as never,
            doNotSend: true,
            redirectErrorsToConsole: true,
        })
    )
}

export async function persist(timer: Timer, fireAt = timer.fireAt) {
    timer.fireAt = fireAt
    await Database.set(timer)
    return timer
}

export { Database, Timer, TimerKind }
