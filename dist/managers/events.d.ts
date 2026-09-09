import { BaseCommandManager, BaseEventHandler, ForgeClient } from "@tryforge/forgescript";
import { ITimerEvents, TimerEvent } from "../types";
export declare const HANDLER = "ForgeTimersEvents";
export declare class TimerCommandManager extends BaseCommandManager<TimerEvent> {
    handlerName: string;
}
export declare class TimerEventHandler extends BaseEventHandler<ITimerEvents, TimerEvent> {
    register(client: ForgeClient): void;
}
export declare function runCommands(client: ForgeClient, event: TimerEvent, environment: Record<string, unknown>): void;
//# sourceMappingURL=events.d.ts.map