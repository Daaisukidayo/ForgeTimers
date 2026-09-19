import { IStoredOverrides, ITimerOverrides } from "../types";
/**
 * Keeps only the options a call actually spelled out.
 *
 * @param passed Every override the call could carry, filled in or not.
 * @returns What to store, or null when the call named nothing.
 */
export declare function overridesOf(passed: ITimerOverrides): IStoredOverrides | null;
/**
 * Reads back what {@link overridesOf} wrote.
 * @param stored The overrides a timer came out of the database with.
 */
export declare function readOverrides(stored: IStoredOverrides): ITimerOverrides;
//# sourceMappingURL=overrides.d.ts.map