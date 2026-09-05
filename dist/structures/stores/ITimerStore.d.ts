import { ITimer, Timer, TimerKind } from "../Timer";
/** Fields to match on. The SQL backend also takes typeorm operators as values */
export type ITimerFindOptions = Partial<Record<keyof ITimer, unknown>>;
/** How many rows a write touched. Only `delete` reports it, `stop` reads it */
export interface IDeleteResult {
    affected: number;
}
/**
 * Everything ForgeTimers needs from a database. One implementation per backend, picked by the `storage` option.
*/
export interface ITimerStore {
    init(): Promise<void>;
    destroy(): Promise<void>;
    get(kind: TimerKind, name: string): Promise<Timer | null>;
    getAll(): Promise<Timer[]>;
    getAllOf(kind: TimerKind): Promise<Timer[]>;
    find(data?: ITimerFindOptions, amount?: number): Promise<Timer[]>;
    set(timer: Timer): Promise<void>;
    delete(kind: TimerKind, name: string): Promise<IDeleteResult>;
    wipe(): Promise<void>;
}
//# sourceMappingURL=ITimerStore.d.ts.map