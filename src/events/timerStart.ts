import { TimerEventHandler, runCommands } from "../managers"
import { TimerEvent } from "../types"

export default new TimerEventHandler({
    name: TimerEvent.timerStart,
    description: "Triggered when a timer is scheduled",
    version: "1.3.0",
    listener(environment) {
        runCommands(this, TimerEvent.timerStart, environment)
    },
})
