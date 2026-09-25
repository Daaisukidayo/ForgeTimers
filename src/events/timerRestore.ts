import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerRestore",
    version: "1.3.0",
    description: "Triggered when a stored timer is picked back up after a restart",
    listener(environment) {
        runCommands(this, "timerRestore", environment)
    },
})
