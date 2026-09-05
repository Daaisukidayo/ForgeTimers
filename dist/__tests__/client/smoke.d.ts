export declare const SEEDED = "SMOKE:SEEDED";
export declare const PASS = "SMOKE:PASS";
export declare const FAIL = "SMOKE:FAIL";
export declare const TIMEOUT_NAME = "smoke-timeout";
export declare const INTERVAL_NAME = "smoke-interval";
export declare const TIMEOUT_DELAY = "60s";
export declare const INTERVAL_TICK = "20s";
export declare const TOLERANCE = 3000;
export interface ISmokePlan {
    timeoutDueAt: number;
    seededAt: number;
}
export declare function readPlan(): ISmokePlan | null;
export declare function clearPlan(): void;
export declare const reports: Array<{
    label: string;
    at: number;
}>;
export declare function report(label: string): void;
export declare function runSmoke(plan: ISmokePlan | null): Promise<void>;
//# sourceMappingURL=smoke.d.ts.map