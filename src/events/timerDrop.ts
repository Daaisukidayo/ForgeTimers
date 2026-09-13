import { TimerEventHandler, runCommands } from "../managers"
import { TimerEvent } from "../types"

export default new TimerEventHandler({
    name: TimerEvent.timerDrop,
    description: "Triggered when a stored timer is thrown away without running, with the reason in $env[reason]",
    version: "1.3.0",
    listener(environment) {
        runCommands(this, TimerEvent.timerDrop, environment)
    },
})
