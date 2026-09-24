import { IStoredOverrides, ITimerOverrides } from "../types";
/**
 * Keeps only the options a call spelled out.
 * @param passed Every override the call could carry, filled in or not.
 * @returns What to store, null when the call named nothing.
 */
export declare function overridesOf(passed: ITimerOverrides): IStoredOverrides | null;
/**
 * Reads back what {@link overridesOf} wrote.
 * @param stored Overrides as stored.
 */
export declare function readOverrides(stored: IStoredOverrides): ITimerOverrides;
//# sourceMappingURL=overrides.d.ts.map