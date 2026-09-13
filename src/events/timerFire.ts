import { TimerEventHandler, runCommands } from "../managers"
import { TimerEvent } from "../types"

export default new TimerEventHandler({
    name: TimerEvent.timerFire,
    description: "Triggered when a timer's code runs: a timeout going off, or an interval ticking",
    version: "1.3.0",
    listener(environment) {
        runCommands(this, TimerEvent.timerFire, environment)
    },
})
