import { CompiledFunction } from "@tryforge/forgescript";
import { Timer } from "../structures";
export declare enum TimerProperty {
    id = "id",
    name = "name",
    kind = "kind",
    code = "code",
    duration = "duration",
    cron = "cron",
    timezone = "timezone",
    timestamp = "timestamp",
    fireAt = "fireAt",
    timeLeft = "timeLeft",
    paused = "paused",
    guildID = "guildID",
    channelID = "channelID",
    authorID = "authorID",
    messageID = "messageID",
    args = "args",
    config = "config"
}
export type ITimerFilter = [TimerProperty, string];
export type IFilterResult = {
    ok: true;
    pairs: ITimerFilter[];
} | {
    ok: false;
    reason: string;
};
/**
 * Objects go back as JSON, plain text would flatten them to [object Object].
 * @param value Value to check.
 */
export declare function isStructured(value: unknown): value is object;
/**
 * Answers with one property, JSON for objects and plain text for the rest.
 * @param fn The native answering.
 * @param timer Timer to read.
 * @param property Property to answer with.
 */
export declare function answer(fn: Pick<CompiledFunction, "success" | "successJSON">, timer: Timer, property: TimerProperty): import("@tryforge/forgescript").Return<import("@tryforge/forgescript").ReturnType.Success>;
/**
 * A property as text, the form every filter compares against.
 * @param timer Timer to read.
 * @param property Property to read.
 */
export declare function textOf(timer: Timer, property: TimerProperty): string;
/**
 * Reads flat property and value pairs.
 * @param filters Arguments as given, each property followed by the value it must read as.
 * @returns The pairs, or why they could not be read.
 */
export declare function readFilters(filters: string[]): IFilterResult;
/**
 * Whether a timer matches every pair.
 * @param timer Timer to check.
 * @param pairs All of them have to match.
 */
export declare function matches(timer: Timer, pairs: ITimerFilter[]): boolean;
export declare function readProperties(timer: Timer): Record<string, unknown>;
export declare const TimerProperties: Record<TimerProperty, (timer: Timer) => unknown>;
//# sourceMappingURL=timer.d.ts.map