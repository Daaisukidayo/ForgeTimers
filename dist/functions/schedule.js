"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DELAY = void 0;
exports.setLongTimeout = setLongTimeout;
exports.setLongInterval = setLongInterval;
/** Node clamps anything past this to 1ms, so a month-long wait would fire at once */
exports.MAX_DELAY = 2_147_483_647;
/**
 * `setTimeout` for any length, chunked past {@link MAX_DELAY}.
 * @param delay How long to wait, in ms.
 * @param fn What to run once the delay has elapsed.
 * @param onArm Every chunk's handle, so callers can cancel the pending one.
 * @returns The first chunk's handle.
 */
function setLongTimeout(delay, fn, onArm) {
    const deadline = Date.now() + delay;
    const arm = (ms) => {
        const handle = setTimeout(() => {
            const left = deadline - Date.now();
            if (left > 1)
                return arm(left);
            fn();
        }, Math.min(ms, exports.MAX_DELAY));
        onArm?.(handle);
        return handle;
    };
    return arm(delay);
}
/**
 * `setInterval` for any tick length. Re-arms before running, so a slow tick only delays itself.
 * @param duration How long each tick lasts, in ms.
 * @param fn What to run on every tick.
 * @param onArm Every chunk's handle, so callers can cancel the pending one.
 * @returns The first chunk's handle.
 */
function setLongInterval(duration, fn, onArm) {
    const arm = () => setLongTimeout(duration, () => {
        arm();
        void fn();
    }, onArm);
    return arm();
}
//# sourceMappingURL=schedule.js.map