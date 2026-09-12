import { DataBaseManager } from "@tryforge/forge.db";
import { DiscordAPIError } from "discord.js";
import { ForgeTimers } from "..";
import { TimerStorage } from "../types";
import { Database, Timer, TimerKind } from "../structures";
export declare class ConfigSeed extends DataBaseManager {
    database: string;
    entityManager: {
        sqlite: never[];
        mongodb: never[];
        mysql: never[];
        postgres: never[];
    };
}
export type TestDatabase = "sqlite" | "postgres" | "mysql" | "mongodb" | "quoriel";
export type SqlDatabase = Exclude<TestDatabase, "sqlite" | "quoriel">;
export type TestConnection = {
    type: "better-sqlite3" | "quoriel";
    folder: string;
} | {
    type: "postgres" | "mysql" | "mongodb";
    url: string;
};
export declare const DATABASE_ENV: Record<SqlDatabase, string>;
export declare function connectionFor(target: TestDatabase): TestConnection | null;
export interface IFakeTarget {
    id?: string;
    channel?: {
        id: string;
        partial?: boolean;
    } | null;
    guild?: {
        id: string;
    } | null;
    author?: {
        id: string;
    } | null;
}
export interface ITestClient {
    client: any;
    ext: ForgeTimers;
    channels: Map<string, unknown>;
    users: Map<string, unknown>;
    members: Map<string, unknown>;
    fetches: {
        channels: number;
        commands: number;
    };
    commands: unknown[];
    channelError?: unknown;
    guilds: Set<string>;
    ready(): Promise<void>;
    disarm(): void;
    reset(): void;
}
export declare const marks: string[];
/** Waits for something to become true instead of guessing how long it takes */
export declare function waitFor(condition: () => boolean | Promise<boolean>, timeout?: number): Promise<boolean>;
/** Wraps an extension in a client it can believe in, without any of the setup boot() does */
export declare function attach(ext: ForgeTimers): ITestClient;
export declare function boot(options?: ConstructorParameters<typeof ForgeTimers>[0], target?: TestDatabase): Promise<ITestClient & {
    folder: string | undefined;
    cleanup: () => Promise<void>;
}>;
export declare function run(harness: ITestClient, code: string, target?: IFakeTarget): Promise<string | null>;
export type TestHarness = Awaited<ReturnType<typeof boot>>;
export interface IHarnessSetup {
    options?: ConstructorParameters<typeof ForgeTimers>[0];
    target?: TestDatabase;
    setup?(harness: TestHarness): void | Promise<void>;
}
export declare function useHarness(assign: (harness: TestHarness) => void, config?: IHarnessSetup): void;
export declare function useTempHome(prefix: string): string;
export declare const marked: (mark: string) => Promise<boolean>;
export declare const apiError: (status: number, code: number, message: string) => DiscordAPIError;
export declare function contentsOf(storage: TimerStorage): Promise<string[]>;
type DatabaseCall = "set" | "delete" | "get" | "getAll" | "wipe";
export declare function patchDatabase<K extends DatabaseCall>(call: K, make: (real: (typeof Database)[K]) => (typeof Database)[K]): void;
export declare function restoreDatabase(): void;
export declare function persist(timer: Timer, fireAt?: number): Promise<Timer>;
export { Database, Timer, TimerKind };
//# sourceMappingURL=harness.d.ts.map