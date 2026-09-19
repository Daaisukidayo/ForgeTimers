"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.overridesOf = overridesOf;
exports.readOverrides = readOverrides;
/** What `Infinity` is written as, since JSON cannot carry the number itself */
const INFINITY = "Infinity";
/** An argument left blank arrives as an empty string, and one the call never reached as null */
const given = (config) => Object.entries(config).filter(([, value]) => value !== undefined && value !== null && value !== "");
/**
 * Keeps only the options a call actually spelled out.
 *
 * @param passed Every override the call could carry, filled in or not.
 * @returns What to store, or null when the call named nothing.
 */
function overridesOf(passed) {
    const named = given(passed);
    if (!named.length)
        return null;
    const stored = Object.fromEntries(named);
    if (stored.restoredTicksLimit === Infinity)
        stored.restoredTicksLimit = INFINITY;
    return stored;
}
/**
 * Reads back what {@link overridesOf} wrote.
 * @param stored The overrides a timer came out of the database with.
 */
function readOverrides(stored) {
    const config = Object.fromEntries(given(stored));
    if (stored.restoredTicksLimit === INFINITY)
        config.restoredTicksLimit = Infinity;
    return config;
}
//# sourceMappingURL=overrides.js.map