import { IPersistedVars } from "./varsSnapshot";
export declare enum TimerKind {
    Timeout = "timeout",
    Interval = "interval"
}
export interface IPersistedTimer {
    id: string;
    kind: TimerKind;
    /** Raw ForgeScript code */
    code: string;
    path?: string | null;
    /** Absolute unix ms timestamp of the next time this should fire */
    fireAt: number;
    /** Only present for kind === TimerKind.Interval */
    interval?: number;
    /** Snapshot of the scheduling context's serializable variables */
    vars?: IPersistedVars;
    guildId?: string | null;
    channelId: string;
    userId?: string | null;
    messageId?: string | null;
}
export interface ITimersStore {
    load(): Promise<IPersistedTimer[]>;
    save(record: IPersistedTimer): Promise<void>;
    delete(id: string): Promise<void>;
    clear(): Promise<void>;
}
/** Store registry, one per timer kind */
export type TimersStores = Map<TimerKind, ITimersStore>;
//# sourceMappingURL=timersStore.d.ts.map