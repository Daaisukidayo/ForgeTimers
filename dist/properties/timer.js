"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerProperties = exports.TimerProperty = void 0;
exports.textOf = textOf;
exports.readFilters = readFilters;
exports.matches = matches;
exports.readProperties = readProperties;
var TimerProperty;
(function (TimerProperty) {
    TimerProperty["id"] = "id";
    TimerProperty["name"] = "name";
    TimerProperty["kind"] = "kind";
    TimerProperty["code"] = "code";
    TimerProperty["duration"] = "duration";
    TimerProperty["cron"] = "cron";
    TimerProperty["timezone"] = "timezone";
    TimerProperty["timestamp"] = "timestamp";
    TimerProperty["fireAt"] = "fireAt";
    TimerProperty["timeLeft"] = "timeLeft";
    TimerProperty["paused"] = "paused";
    TimerProperty["guildID"] = "guildID";
    TimerProperty["channelID"] = "channelID";
    TimerProperty["authorID"] = "authorID";
    TimerProperty["messageID"] = "messageID";
    TimerProperty["args"] = "args";
    TimerProperty["config"] = "config";
})(TimerProperty || (exports.TimerProperty = TimerProperty = {}));
/** How a property reads as text, so every one of them can be matched the same way */
function textOf(timer, property) {
    const value = exports.TimerProperties[property](timer);
    if (value === null || value === undefined)
        return "";
    return typeof value === "object" ? JSON.stringify(value) : String(value);
}
/**
 * Reads a flat list of property and value pairs.
 * @param filters The arguments as they were given, each property followed by what it has to read as.
 * @returns The pairs, or why the list could not be read.
 */
function readFilters(filters) {
    if (filters.length % 2) {
        const reason = `Every filter needs a property and a value, and "${filters.at(-1)}" was left without one.`;
        return { ok: false, reason };
    }
    const pairs = [];
    for (let i = 0; i < filters.length; i += 2) {
        const named = filters[i];
        if (!(named in exports.TimerProperties))
            return { ok: false, reason: `"${named}" is not a timer property.` };
        pairs.push([named, filters[i + 1]]);
    }
    return { ok: true, pairs };
}
/**
 * Whether a timer answers to every pair.
 * @param timer The timer to look at.
 * @param pairs What it has to match, all of them.
 */
function matches(timer, pairs) {
    return pairs.every(([named, wanted]) => textOf(timer, named) === wanted);
}
function readProperties(timer) {
    const out = {};
    for (const [property, read] of Object.entries(exports.TimerProperties))
        out[property] = read(timer);
    return out;
}
exports.TimerProperties = {
    [TimerProperty.id]: (t) => t.id,
    [TimerProperty.name]: (t) => t.name,
    [TimerProperty.kind]: (t) => t.kind,
    [TimerProperty.code]: (t) => t.code,
    [TimerProperty.duration]: (t) => t.duration,
    [TimerProperty.cron]: (t) => t.cron ?? null,
    [TimerProperty.timezone]: (t) => t.timezone ?? null,
    [TimerProperty.timestamp]: (t) => t.timestamp,
    [TimerProperty.fireAt]: (t) => t.fireAt,
    [TimerProperty.timeLeft]: (t) => t.timeLeft(),
    [TimerProperty.paused]: (t) => t.isPaused(),
    [TimerProperty.guildID]: (t) => t.guildID,
    [TimerProperty.channelID]: (t) => t.channelID,
    [TimerProperty.authorID]: (t) => t.authorID,
    [TimerProperty.messageID]: (t) => t.messageID,
    [TimerProperty.args]: (t) => t.args ?? [],
    [TimerProperty.config]: (t) => t.config ?? {},
};
//# sourceMappingURL=timer.js.map