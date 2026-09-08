export declare const SEEDED = "SMOKE:SEEDED";
export declare const PASS = "SMOKE:PASS";
export declare const FAIL = "SMOKE:FAIL";
export declare const TIMEOUT_NAME = "smoke-timeout";
export declare const INTERVAL_NAME = "smoke-interval";
export declare const OVERDUE_NAME = "smoke-overdue";
export declare const CHANNEL: string | undefined;
export declare const TIMEOUT_DELAY = "60s";
export declare const INTERVAL_TICK = "20s";
/** Shorter than the downtime, so this one comes due while the bot is off */
export declare const OVERDUE_DELAY = "10s";
/** Set before the timers are scheduled, and read back by one of them after the restart */
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
export declare const reports: Array<{
    label: string;
    at: number;
}>;
export declare function report(label: string): void;
export declare function runSmoke(plan: ISmokePlan | null): Promise<void>;
//# sourceMappingURL=smoke.d.ts.map