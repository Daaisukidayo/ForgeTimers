export declare const MAX_DELAY = 2147483647;
/**
 * `setTimeout` for any length, chunked past {@link MAX_DELAY}.
 * @param delay Wait in ms.
 * @param fn What to run once it is over.
 * @param onArm Gets every chunk's handle. Cancel the latest one, not the first.
 * @returns First chunk's handle.
 */
export declare function setLongTimeout(delay: number, fn: () => void, onArm?: (handle: NodeJS.Timeout) => void): NodeJS.Timeout;
/**
 * `setInterval` for any tick length. Re-arms before running.
 * @param duration Tick length in ms.
 * @param fn What to run every tick.
 * @param onArm Gets every chunk's handle. Cancel the latest one, not the first.
 * @returns First chunk's handle.
 */
export declare function setLongInterval(duration: number, fn: () => void | Promise<void>, onArm?: (handle: NodeJS.Timeout) => void): NodeJS.Timeout;
//# sourceMappingURL=schedule.d.ts.map