"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schedulingError = schedulingError;
exports.originOf = originOf;
const structures_1 = require("../structures");
/**
 * What a scheduling call got wrong, null when nothing. The first problem wins.
 * @param code The code field. Only forgescript 2.7.0 and newer keep its raw text.
 * @param kind Kind being scheduled.
 * @param name Name it goes under, empty for an unnamed one.
 * @param overrides Options the call spelled out.
 */
function schedulingError(code, kind, name, { maxOverdue, restoredTicksLimit }) {
    if (typeof code.rawValue !== "string")
        return "@tryforge/forgescript v2.7.0 or newer is required.";
    if (maxOverdue !== undefined && maxOverdue < 0) {
        return "maxOverdue cannot be negative. Leave it out for no limit at all.";
    }
    if (restoredTicksLimit !== undefined && restoredTicksLimit < 0) {
        const missed = kind === structures_1.TimerKind.cron ? "occurrence" : "tick";
        return `restoredTicksLimit cannot be negative. Use 0 to replay nothing, or Infinity to replay every missed ${missed}.`;
    }
    const max = structures_1.Timer.maxNameLength(kind);
    if (name && name.length > max) {
        const article = kind === structures_1.TimerKind.interval ? "An" : "A";
        return `${article} ${kind} name may be at most ${max} characters long, got ${name.length}.`;
    }
    return null;
}
/**
 * Where a timer was scheduled from. The same fields for every kind.
 * @param ctx Context of the scheduling call.
 */
function originOf(ctx) {
    return {
        path: ctx.cmd?.data.path ?? null,
        commandName: ctx.cmd?.data.name ?? null,
        guildID: ctx.guild?.id ?? null,
        channelID: ctx.channel?.id ?? null,
        authorID: ctx.user?.id ?? null,
        messageID: ctx.message?.id ?? null,
        args: ctx.args.length ? [...ctx.args] : undefined,
    };
}
//# sourceMappingURL=scheduling.js.map