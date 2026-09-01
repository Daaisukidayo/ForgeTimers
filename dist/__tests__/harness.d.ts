import { ForgeTimers } from "..";
import { Database, Timer, TimerKind } from "../structures";
export type TestDatabase = "sqlite" | "postgres" | "mysql" | "mongodb";
export type TestConnection = {
    type: "better-sqlite3";
    folder: string;
} | {
    type: "postgres" | "mysql" | "mongodb";
    url: string;
};
export declare const DATABASE_ENV: Record<Exclude<TestDatabase, "sqlite">, string>;
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
    fetches: {
        channels: number;
    };
    commands: unknown[];
    channelError?: unknown;
    guilds: Set<string>;
    ready(): Promise<void>;
    disarm(): void;
}
export declare const marks: string[];
/** Waits for something to become true instead of guessing how long it takes */
export declare function waitFor(condition: () => boolean | Promise<boolean>, timeout?: number): Promise<boolean>;
export declare function boot(options?: ConstructorParameters<typeof ForgeTimers>[0], target?: TestDatabase): Promise<ITestClient & {
    folder: string | undefined;
    cleanup: () => Promise<void>;
}>;
export declare function run(harness: ITestClient, code: string, target?: IFakeTarget): Promise<string | null>;
export declare function persist(timer: Timer, fireAt?: number): Promise<Timer>;
export { Database, Timer, TimerKind };
//# sourceMappingURL=harness.d.ts.map