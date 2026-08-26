import { Timer } from "../structures"

export enum TimerProperty {
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

export const TimerProperties: Record<TimerProperty, (timer: Timer) => unknown> = {
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
}