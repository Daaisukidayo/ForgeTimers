import { ArgType, NativeFunction } from "@tryforge/forgescript";
import { TimerKind } from "../..";
import { TimerProperty } from "../../properties/timer";
declare const _default: NativeFunction<[{
    name: string;
    description: string;
    rest: false;
    type: ArgType.Enum;
    enum: typeof TimerKind;
}, {
    name: string;
    description: string;
    rest: false;
    type: ArgType.Enum;
    enum: typeof TimerProperty;
}, {
    name: string;
    description: string;
    rest: false;
    type: ArgType.String;
}], true>;
export default _default;
//# sourceMappingURL=getAllTimers.d.ts.map