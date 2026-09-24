import { Context, IExtendedCompiledFunctionField } from "@tryforge/forgescript";
import { TimerKind } from "../structures";
import { ITimerOverrides } from "../types";
/**
 * What a scheduling call got wrong, null when nothing. The first problem wins.
 * @param code The code field. Only forgescript 2.7.0 and newer keep its raw text.
 * @param kind Kind being scheduled.
 * @param name Name it goes under, empty for an unnamed one.
 * @param overrides Options the call spelled out.
 */
export declare function schedulingError(code: IExtendedCompiledFunctionField, kind: TimerKind, name: string | undefined, { maxOverdue, restoredTicksLimit }: ITimerOverrides): string | null;
/**
 * Where a timer was scheduled from. The same fields for every kind.
 * @param ctx Context of the scheduling call.
 */
export declare function originOf(ctx: Context): {
    path: string | null;
    commandName: string | null;
    guildID: string | null;
    channelID: string | null;
    authorID: string | null;
    messageID: string | null;
    args: string[] | undefined;
};
//# sourceMappingURL=scheduling.d.ts.map