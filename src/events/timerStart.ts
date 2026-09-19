import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerStart",
    version: "1.3.0",
    description: "Triggered when a timer is scheduled",
    listener(environment) {
        runCommands(this, "timerStart", environment)
    },
})
