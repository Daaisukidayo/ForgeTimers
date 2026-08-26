import { Timer } from "../structures";
export declare enum TimerProperty {
    id = "id",
    name = "name",
    kind = "kind",
    code = "code",
    duration = "duration",
    timestamp = "timestamp",
    fireAt = "fireAt",
    timeLeft = "timeLeft",
    guildID = "guildID",
    channelID = "channelID",
    hostID = "hostID",
    messageID = "messageID",
    args = "args"
}
export declare const TimerProperties: Record<TimerProperty, (timer: Timer) => unknown>;
//# sourceMappingURL=timer.d.ts.map