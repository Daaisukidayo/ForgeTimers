import { TimerEventHandler, runCommands } from "../managers"
import { TimerEvent } from "../types"

export default new TimerEventHandler({
    name: TimerEvent.timerRestore,
    description: "Triggered when a stored timer is picked back up after a restart",
    version: "1.3.0",
    listener(environment) {
        runCommands(this, TimerEvent.timerRestore, environment)
    },
})
