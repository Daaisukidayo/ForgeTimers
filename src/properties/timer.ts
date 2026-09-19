import { Timer } from "../structures"

export enum TimerProperty {
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
    config = "config",
}

export function readProperties(timer: Timer) {
    const out: Record<string, unknown> = {}
    for (const [property, read] of Object.entries(TimerProperties)) out[property] = read(timer)

    return out
}

export const TimerProperties: Record<TimerProperty, (timer: Timer) => unknown> = {
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
}
