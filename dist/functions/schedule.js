"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_DELAY = void 0;
exports.setLongTimeout = setLongTimeout;
exports.setLongInterval = setLongInterval;
exports.MAX_DELAY = 2_147_483_647;
/**
 * `setTimeout` for any length, chunked past {@link MAX_DELAY}.
 * @param delay Wait in ms.
 * @param fn What to run once it is over.
 * @param onArm Gets every chunk's handle. Cancel the latest one, not the first.
 * @returns First chunk's handle.
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
 * `setInterval` for any tick length. Re-arms before running.
 * @param duration Tick length in ms.
 * @param fn What to run every tick.
 * @param onArm Gets every chunk's handle. Cancel the latest one, not the first.
 * @returns First chunk's handle.
 */
function setLongInterval(duration, fn, onArm) {
    const arm = () => setLongTimeout(duration, () => {
        arm();
        void fn();
    }, onArm);
    return arm();
}
//# sourceMappingURL=schedule.js.map