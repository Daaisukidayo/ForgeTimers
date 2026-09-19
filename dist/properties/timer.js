"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerProperties = exports.TimerProperty = void 0;
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
    TimerProperty["hostID"] = "hostID";
    TimerProperty["messageID"] = "messageID";
    TimerProperty["args"] = "args";
    TimerProperty["config"] = "config";
})(TimerProperty || (exports.TimerProperty = TimerProperty = {}));
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
    [TimerProperty.hostID]: (t) => t.hostID,
    [TimerProperty.messageID]: (t) => t.messageID,
    [TimerProperty.args]: (t) => t.args ?? [],
    [TimerProperty.config]: (t) => t.config ?? {},
};
//# sourceMappingURL=timer.js.map