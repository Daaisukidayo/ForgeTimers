import { ArgType, NativeFunction } from "@tryforge/forgescript";
import { TimerKind } from "../..";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.Enum;
    enum: typeof TimerKind;
}, {
    name: string;
    description: string;
    rest: false;
    required: true;
    type: ArgType.String;
}], true>;
export default _default;
//# sourceMappingURL=timerExists.d.ts.map