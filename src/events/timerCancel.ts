import { TimerEventHandler, runCommands } from "../managers"
import { TimerEvent } from "../types"

export default new TimerEventHandler({
    name: TimerEvent.timerCancel,
    description: "Triggered when a timer is cancelled by hand",
    version: "1.3.0",
    listener(environment) {
        runCommands(this, TimerEvent.timerCancel, environment)
    },
})
