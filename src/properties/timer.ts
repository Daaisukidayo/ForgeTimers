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
    authorID = "authorID",
    messageID = "messageID",
    args = "args",
    config = "config",
}

export type ITimerFilter = [TimerProperty, string]

export type IFilterResult = { ok: true; pairs: ITimerFilter[] } | { ok: false; reason: string }

/** Whether a value has to go back as JSON, since plain text flattens it to [object Object] */
export function isStructured(value: unknown) {
    return typeof value === "object" && value !== null
}

/** How a property reads as text, so every one of them can be matched the same way */
export function textOf(timer: Timer, property: TimerProperty) {
    const value = TimerProperties[property](timer)

    if (value === null || value === undefined) return ""
    return typeof value === "object" ? JSON.stringify(value) : String(value)
}

/**
 * Reads a flat list of property and value pairs.
 * @param filters The arguments as they were given, each property followed by what it has to read as.
 * @returns The pairs, or why the list could not be read.
 */
export function readFilters(filters: string[]): IFilterResult {
    if (filters.length % 2) {
        const reason = `Every filter needs a property and a value, and "${filters.at(-1)}" was left without one.`
        return { ok: false, reason }
    }

    const pairs: ITimerFilter[] = []

    for (let i = 0; i < filters.length; i += 2) {
        const named = filters[i] as TimerProperty

        // "in" reaches the prototype, where toString would match every timer and __proto__ would throw
        if (!Object.hasOwn(TimerProperties, named)) return { ok: false, reason: `"${named}" is not a timer property.` }

        pairs.push([named, filters[i + 1]])
    }

    return { ok: true, pairs }
}

/**
 * Whether a timer answers to every pair.
 * @param timer The timer to look at.
 * @param pairs What it has to match, all of them.
 */
export function matches(timer: Timer, pairs: ITimerFilter[]) {
    return pairs.every(([named, wanted]) => textOf(timer, named) === wanted)
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
    [TimerProperty.authorID]: (t) => t.authorID,
    [TimerProperty.messageID]: (t) => t.messageID,
    [TimerProperty.args]: (t) => t.args ?? [],
    [TimerProperty.config]: (t) => t.config ?? {},
}
