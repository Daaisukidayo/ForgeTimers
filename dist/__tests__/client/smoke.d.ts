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
export declare const CHANNEL: string | undefined;
export declare const SPEED: number;
/** How long the bot stays down between the two runs */
export declare const DOWNTIME: number;
/** Still ahead of the second boot whatever the speed, or the timer would come due before anyone looks */
export declare const TIMEOUT_DELAY: string;
export declare const INTERVAL_TICK: string;
/** Shorter than the downtime, so this one comes due while the bot is off */
export declare const OVERDUE_DELAY: string;
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
/** Every event reports under the name of the timer it is about */
export declare const eventCode: (event: string) => string;
/** An event command runs with no target of its own, so this checks one can still reach discord */
export declare const EVENT_MESSAGE_CODE: string;
export declare const reports: Array<{
    label: string;
    at: number;
}>;
export declare function report(label: string): void;
export declare function runSmoke(plan: ISmokePlan | null): Promise<void>;
//# sourceMappingURL=smoke.d.ts.map