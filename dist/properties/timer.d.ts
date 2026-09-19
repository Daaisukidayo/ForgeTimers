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
    hostID = "hostID",
    messageID = "messageID",
    args = "args",
    config = "config"
}
export declare function readProperties(timer: Timer): Record<string, unknown>;
export declare const TimerProperties: Record<TimerProperty, (timer: Timer) => unknown>;
//# sourceMappingURL=timer.d.ts.map