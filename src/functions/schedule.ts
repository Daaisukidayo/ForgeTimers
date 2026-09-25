export const MAX_DELAY = 2_147_483_647

/**
 * `setTimeout` for any length, chunked past {@link MAX_DELAY}.
 * @param delay Wait in ms.
 * @param fn What to run once it is over.
 * @param onArm Gets every chunk's handle. Cancel the latest one, not the first.
 * @returns First chunk's handle.
 */
export function setLongTimeout(delay: number, fn: () => void, onArm?: (handle: NodeJS.Timeout) => void) {
    const deadline = Date.now() + delay

    const arm = (ms: number): NodeJS.Timeout => {
        const handle = setTimeout(
            () => {
                const left = deadline - Date.now()
                if (left > 1) return arm(left)
                fn()
            },
            Math.min(ms, MAX_DELAY)
        )

        onArm?.(handle)
        return handle
    }

    return arm(delay)
}

/**
 * `setInterval` for any tick length. Re-arms before running.
 * @param duration Tick length in ms.
 * @param fn What to run every tick.
 * @param onArm Gets every chunk's handle. Cancel the latest one, not the first.
 * @returns First chunk's handle.
 */
export function setLongInterval(
    duration: number,
    fn: () => void | Promise<void>,
    onArm?: (handle: NodeJS.Timeout) => void
) {
    const arm = (): NodeJS.Timeout =>
        setLongTimeout(
            duration,
            () => {
                arm()
                void fn()
            },
            onArm
        )

    return arm()
}
