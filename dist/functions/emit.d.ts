import type { EventEmitter } from "node:events";
import type { ITimerEventPayload, ITimerEvents, TimerEvent } from "../types";
/**
 * Emits without letting a throwing listener undo whatever reported the event.
 * @param emitter The extension's emitter.
 * @param event Event to emit.
 * @param payload What it carries.
 */
export declare function emitSafely(emitter: EventEmitter<ITimerEvents>, event: TimerEvent, payload: ITimerEventPayload): void;
//# sourceMappingURL=emit.d.ts.map