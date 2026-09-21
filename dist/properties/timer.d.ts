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
/** Whether a value has to go back as JSON, since plain text flattens it to [object Object] */
export declare function isStructured(value: unknown): value is object;
/** How a property reads as text, so every one of them can be matched the same way */
export declare function textOf(timer: Timer, property: TimerProperty): string;
/**
 * Reads a flat list of property and value pairs.
 * @param filters The arguments as they were given, each property followed by what it has to read as.
 * @returns The pairs, or why the list could not be read.
 */
export declare function readFilters(filters: string[]): IFilterResult;
/**
 * Whether a timer answers to every pair.
 * @param timer The timer to look at.
 * @param pairs What it has to match, all of them.
 */
export declare function matches(timer: Timer, pairs: ITimerFilter[]): boolean;
export declare function readProperties(timer: Timer): Record<string, unknown>;
export declare const TimerProperties: Record<TimerProperty, (timer: Timer) => unknown>;
//# sourceMappingURL=timer.d.ts.map