import { IStoredOverrides, ITimerOverrides } from "../types"

/** What `Infinity` is written as, since JSON cannot carry the number itself */
const INFINITY = "Infinity"

/** An argument left blank arrives as an empty string, and one the call never reached as null */
const given = (config: ITimerOverrides | IStoredOverrides) =>
    Object.entries(config).filter(([, value]) => value !== undefined && value !== null && value !== "")

/**
 * Keeps only the options a call actually spelled out.
 *
 * @param passed Every override the call could carry, filled in or not.
 * @returns What to store, or null when the call named nothing.
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
 * @param stored The overrides a timer came out of the database with.
 */
export function readOverrides(stored: IStoredOverrides): ITimerOverrides {
    const config: ITimerOverrides = Object.fromEntries(given(stored))
    if (stored.restoredTicksLimit === INFINITY) config.restoredTicksLimit = Infinity

    return config
}
