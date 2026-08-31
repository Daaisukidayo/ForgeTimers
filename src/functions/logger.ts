import { Logger as BaseLogger } from "@tryforge/forgescript"

const PREFIX = "ForgeTimers |"

export class Logger extends BaseLogger {
    public static override debug(...args: unknown[]) {
        BaseLogger.debug(PREFIX, ...args)
    }

    public static override info(...args: unknown[]) {
        BaseLogger.info(PREFIX, ...args)
    }

    public static override warn(...args: unknown[]) {
        BaseLogger.warn(PREFIX, ...args)
    }

    public static override error(...args: unknown[]) {
        BaseLogger.error(PREFIX, ...args)
    }

    public static override deprecated(...args: unknown[]) {
        BaseLogger.deprecated(PREFIX, ...args)
    }
}