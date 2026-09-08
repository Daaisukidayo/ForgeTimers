import { DataBaseManager } from "@tryforge/forge.db"
import {
    ArgType,
    Compiler,
    Context,
    FunctionManager,
    ForgeClient,
    Interpreter,
    NativeFunction,
} from "@tryforge/forgescript"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ForgeTimers } from ".."
import { Database, Timer, TimerKind } from "../structures"

export class ConfigSeed extends DataBaseManager {
    public database = "seed"
    public entityManager = { sqlite: [], mongodb: [], mysql: [], postgres: [] }
}

export type TestDatabase = "sqlite" | "postgres" | "mysql" | "mongodb" | "quoriel"

export type SqlDatabase = Exclude<TestDatabase, "sqlite" | "quoriel">

export type TestConnection =
    { type: "better-sqlite3" | "quoriel"; folder: string } | { type: "postgres" | "mysql" | "mongodb"; url: string }

export const DATABASE_ENV: Record<SqlDatabase, string> = {
    postgres: "FORGETIMERS_TEST_POSTGRES",
    mysql: "FORGETIMERS_TEST_MYSQL",
    mongodb: "FORGETIMERS_TEST_MONGODB",
}

export function connectionFor(target: TestDatabase): TestConnection | null {
    if (target === "sqlite" || target === "quoriel") {
        const folder = mkdtempSync(join(tmpdir(), "forgetimers-test-"))
        return { type: target === "quoriel" ? "quoriel" : "better-sqlite3", folder }
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
    users: Map<string, unknown>
    members: Map<string, unknown>

    fetches: { channels: number }
    commands: unknown[]

    channelError?: unknown

    guilds: Set<string>

    ready(): Promise<void>

    disarm(): void
}

let seeded = false

export const marks: string[] = []

/** Waits for something to become true instead of guessing how long it takes */
export async function waitFor(condition: () => boolean | Promise<boolean>, timeout = 5000) {
    const deadline = Date.now() + timeout

    while (Date.now() < deadline) {
        if (await condition()) return true
        await new Promise((r) => setTimeout(r, 10))
    }

    return await condition()
}

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

/** forge.db arms this on every connection and never clears it, so the process idles it out */
const FORGE_DB_WATCHDOG = 10_000

const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = ((handler: never, ms?: number, ...rest: never[]) => {
    const handle = realSetTimeout(handler, ms as never, ...rest)
    if (ms === FORGE_DB_WATCHDOG) handle.unref?.()
    return handle
}) as typeof globalThis.setTimeout

/** Wraps an extension in a client it can believe in, without any of the setup boot() does */
export function attach(ext: ForgeTimers): ITestClient {
    const channels = new Map<string, unknown>()
    const users = new Map<string, unknown>()
    const members = new Map<string, unknown>()
    const guilds = new Set<string>()
    const handlers: Array<() => unknown> = []

    const fetches = { channels: 0 }

    const harness: ITestClient = {
        ext,
        channels,
        users,
        members,
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
        // a migration checks here for the extension it reads the old timers out of
        options: { extensions: [{ name: "forge.db" }, { name: "QuorielDB" }] },
        canRespondToBots: () => true,
        timeouts: new Map<string, NodeJS.Timeout>(),
        intervals: new Map<string, NodeJS.Timeout>(),
        shard: null,
        guilds: {
            cache: {
                has: (id: string) => guilds.has(id),
                // a guild this process cannot see has no members to hand back either
                get: (id: string) =>
                    guilds.has(id)
                        ? { id, members: { fetch: async (userID: string) => members.get(userID) ?? null } }
                        : undefined,
            },
        },
        users: { fetch: async (id: string) => users.get(id) ?? null },
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

    ext.init(harness.client as unknown as ForgeClient)

    // after init, or the extension's own natives lose to the stock ones
    FunctionManager.loadNative()
    registerMark()

    return harness
}

export async function boot(
    options: ConstructorParameters<typeof ForgeTimers>[0] = {},
    target: TestDatabase = "sqlite"
) {
    const connection = connectionFor(target)
    if (!connection) throw new Error(`${DATABASE_ENV[target as SqlDatabase]} is not set`)

    const folder = "folder" in connection ? connection.folder : undefined
    const home = process.cwd()

    if (target === "quoriel") {
        // quoriel hangs its store off the working directory
        options = { ...options, storage: "quorieldb" }
        process.chdir(folder!)
    } else if (!seeded) {
        new ConfigSeed(connection as never)
        seeded = true
    }

    const harness = attach(new ForgeTimers(options))

    await harness.ext.ready
    await Database.wipe().catch(() => undefined)

    async function cleanup() {
        await Database.wipe().catch(() => undefined)
        await Database.destroy().catch(() => undefined)

        process.chdir(home)
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
