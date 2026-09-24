"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimerContext = void 0;
exports.snapshotRunner = snapshotRunner;
const forgescript_1 = require("@tryforge/forgescript");
/**
 * Runner for a timer scheduled live. Every tick gets fresh copies of the snapshot vars.
 * @param ctx Context the timer was scheduled from.
 * @param resolve What to run, given the tick's context.
 * @returns Runtime the snapshot came from, the runner, and `carries` to hand it its timer.
 */
function snapshotRunner(ctx, resolve) {
    const runtime = ctx.cloneRuntime();
    const vars = {
        keywords: { ...runtime.keywords },
        environment: { ...runtime.environment },
        localFunctions: { ...runtime.localFunctions },
    };
    const carried = {};
    const run = async () => {
        const tick = new TimerContext({
            ...runtime,
            keywords: { ...vars.keywords },
            environment: { ...vars.environment },
            localFunctions: { ...vars.localFunctions },
            timer: carried.timer,
        });
        await resolve(tick);
    };
    return { runtime, run, carries: (timer) => void (carried.timer = timer) };
}
class TimerContext extends forgescript_1.Context {
    runtime;
    constructor(runtime) {
        super(runtime);
        this.runtime = runtime;
    }
    get user() {
        return this.runtime.author ?? super.user ?? null;
    }
    get member() {
        return this.runtime.authorMember ?? super.member ?? null;
    }
    cloneEmpty() {
        return new TimerContext({ ...this.runtime });
    }
    get timer() {
        return this.runtime.timer ?? null;
    }
    get event() {
        return this.runtime.event ?? null;
    }
}
exports.TimerContext = TimerContext;
//# sourceMappingURL=Context.js.map