/** Node clamps anything past this to 1ms, so a month-long wait would fire at once */
export declare const MAX_DELAY = 2147483647;
/**
 * `setTimeout` for any length, chunked past {@link MAX_DELAY}.
 * @param delay How long to wait, in ms.
 * @param fn What to run once the delay has elapsed.
 * @param onArm Every chunk's handle, so callers can cancel the pending one.
 * @returns The first chunk's handle.
 */
export declare function setLongTimeout(delay: number, fn: () => void, onArm?: (handle: NodeJS.Timeout) => void): NodeJS.Timeout;
/**
 * `setInterval` for any tick length. Re-arms before running, so a slow tick only delays itself.
 * @param duration How long each tick lasts, in ms.
 * @param fn What to run on every tick.
 * @param onArm Every chunk's handle, so callers can cancel the pending one.
 * @returns The first chunk's handle.
 */
export declare function setLongInterval(duration: number, fn: () => void | Promise<void>, onArm?: (handle: NodeJS.Timeout) => void): NodeJS.Timeout;
//# sourceMappingURL=schedule.d.ts.map