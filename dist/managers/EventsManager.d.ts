import { BaseCommandManager, BaseEventHandler, ForgeClient } from "@tryforge/forgescript";
import { ITimerEventPayload, ITimerEvents, TimerEventName } from "../types";
export declare const HANDLER = "ForgeTimersEvents";
export declare class TimerCommandManager extends BaseCommandManager<TimerEventName> {
    handlerName: string;
}
export declare class TimerEventHandler extends BaseEventHandler<ITimerEvents, TimerEventName> {
    register(client: ForgeClient): void;
}
export declare function runCommands(client: ForgeClient, event: TimerEventName, payload: ITimerEventPayload): void;
//# sourceMappingURL=EventsManager.d.ts.map