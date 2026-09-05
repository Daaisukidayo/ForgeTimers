import { Timer, TimerKind } from "../Timer";
import { IDeleteResult, ITimerFindOptions, ITimerStore } from "./ITimerStore";
/** The QuorielDB record type timers live under */
export declare const QUORIEL_TYPE = "timers";
/** Keeps timers in QuorielDB's LMDB store, under its own record type */
export declare class QuorielDBStore implements ITimerStore {
    private db;
    init(): Promise<void>;
    destroy(): Promise<void>;
    /** QuorielDB only opens types its config knows, so put ours there once */
    private register;
    get(kind: TimerKind, name: string): Promise<Timer | null>;
    getAll(): Promise<Timer[]>;
    getAllOf(kind: TimerKind): Promise<Timer[]>;
    find(data?: ITimerFindOptions, amount?: number): Promise<Timer[]>;
    set(timer: Timer): Promise<void>;
    delete(kind: TimerKind, name: string): Promise<IDeleteResult>;
    wipe(): Promise<void>;
}
//# sourceMappingURL=QuorielDBStore.d.ts.map