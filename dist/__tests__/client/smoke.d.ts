export declare const green: (text: string) => string;
export declare const red: (text: string) => string;
export declare const yellow: (text: string) => string;
export declare const cyan: (text: string) => string;
export declare const grey: (text: string) => string;
export declare const bold: (text: string) => string;
export declare const SEEDED = "SMOKE:SEEDED";
export declare const PASS = "SMOKE:PASS";
export declare const FAIL = "SMOKE:FAIL";
export declare const TIMEOUT_NAME = "smoke-timeout";
export declare const INTERVAL_NAME = "smoke-interval";
export declare const OVERDUE_NAME = "smoke-overdue";
export declare const CRON_NAME = "smoke-cron";
export declare const PAUSED_NAME = "smoke-paused";
export declare const CHANNEL: string | undefined;
export declare const SPEED: number;
/** How long the bot stays down between the two runs. */
export declare const DOWNTIME: number;
/** Still ahead of the second boot at any speed, else the timer comes due before anyone looks. */
export declare const TIMEOUT_DELAY: string;
export declare const INTERVAL_TICK: string;
/**
 * Seconds between cron runs. A divisor of 60, then every occurrence lands on a whole multiple
 * of it and the restart can be checked against the expression's own beat.
 */
export declare const CRON_SECONDS: number;
export declare const CRON_EXPRESSION: string;
/** A hold freezes what is left. Only has to be short enough to wait out once resumed. */
export declare const PAUSED_DELAY: string;
/** Shorter than the downtime, comes due while the bot is off. */
export declare const OVERDUE_DELAY: string;
/** Set before scheduling, read back by one of the timers after the restart. */
export declare const CARRIED = "carried-across";
export declare const TOLERANCE = 3000;
export interface ISmokePlan {
    timeoutDueAt: number;
    overdueDueAt: number;
    seededAt: number;
}
export declare function readPlan(): ISmokePlan | null;
export declare function clearPlan(): void;
export declare const TIMEOUT_CODE: string;
export declare const SEED_CODE: string;
/**
 * What the second boot runs. Reads the held timer before letting it go, which catches the restart
 * leaving it alone and not only the resume working.
 */
export declare const VERIFY_CODE: string;
/** Every event reports under its timer's name. */
export declare const eventCode: (event: string) => string;
/** An event command has no target of its own. Checks one still reaches discord. */
export declare const EVENT_MESSAGE_CODE: string;
export declare const reports: Array<{
    label: string;
    at: number;
}>;
export declare function report(label: string): void;
export declare function runSmoke(plan: ISmokePlan | null): Promise<void>;
//# sourceMappingURL=smoke.d.ts.map