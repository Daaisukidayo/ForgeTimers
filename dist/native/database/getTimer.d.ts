import { ArgType, NativeFunction } from "@tryforge/forgescript";
import { TimerProperty } from "../../properties/timer";
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
}, {
    name: string;
    description: string;
    rest: false;
    type: ArgType.Enum;
    enum: typeof TimerProperty;
}], true>;
export default _default;
//# sourceMappingURL=getTimer.d.ts.map