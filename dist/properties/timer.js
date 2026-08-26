"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerProperties = exports.TimerProperty = void 0;
var TimerProperty;
(function (TimerProperty) {
    TimerProperty["id"] = "id";
    TimerProperty["name"] = "name";
    TimerProperty["kind"] = "kind";
    TimerProperty["code"] = "code";
    TimerProperty["duration"] = "duration";
    TimerProperty["timestamp"] = "timestamp";
    TimerProperty["fireAt"] = "fireAt";
    TimerProperty["timeLeft"] = "timeLeft";
    TimerProperty["guildID"] = "guildID";
    TimerProperty["channelID"] = "channelID";
    TimerProperty["hostID"] = "hostID";
    TimerProperty["messageID"] = "messageID";
    TimerProperty["args"] = "args";
})(TimerProperty || (exports.TimerProperty = TimerProperty = {}));
exports.TimerProperties = {
    [TimerProperty.id]: (t) => t.id,
    [TimerProperty.name]: (t) => t.name,
    [TimerProperty.kind]: (t) => t.kind,
    [TimerProperty.code]: (t) => t.code,
    [TimerProperty.duration]: (t) => t.duration,
    [TimerProperty.timestamp]: (t) => t.timestamp,
    [TimerProperty.fireAt]: (t) => t.fireAt,
    [TimerProperty.timeLeft]: (t) => t.timeLeft(),
    [TimerProperty.guildID]: (t) => t.guildID,
    [TimerProperty.channelID]: (t) => t.channelID,
    [TimerProperty.hostID]: (t) => t.hostID,
    [TimerProperty.messageID]: (t) => t.messageID,
    [TimerProperty.args]: (t) => t.args ?? [],
};
//# sourceMappingURL=timer.js.map