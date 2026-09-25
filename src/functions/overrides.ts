import { IStoredOverrides, ITimerOverrides } from "../types"

/** How `Infinity` gets stored. JSON has no such number */
const INFINITY = "Infinity"

/** A blank argument arrives as an empty string, one the call never reached as null */
const given = (config: ITimerOverrides | IStoredOverrides) =>
    Object.entries(config).filter(([, value]) => value !== undefined && value !== null && value !== "")

/**
 * Keeps only the options a call spelled out.
 * @param passed Every override the call could carry, filled in or not.
 * @returns What to store, null when the call named nothing.
 */
export function overridesOf(passed: ITimerOverrides): IStoredOverrides | null {
    const named = given(passed)
    if (!named.length) return null

    const stored: IStoredOverrides = Object.fromEntries(named)
    if (stored.restoredTicksLimit === Infinity) stored.restoredTicksLimit = INFINITY

    return stored
}

/**
 * Reads back what {@link overridesOf} wrote.
 * @param stored Overrides as stored.
 */
export function readOverrides(stored: IStoredOverrides): ITimerOverrides {
    const config: ITimerOverrides = Object.fromEntries(given(stored))
    if (stored.restoredTicksLimit === INFINITY) config.restoredTicksLimit = Infinity

    return config
}
