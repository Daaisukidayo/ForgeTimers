import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerCancel",
    version: "1.3.0",
    description: "Triggered when a timer is cancelled by hand",
    listener(environment) {
        runCommands(this, "timerCancel", environment)
    },
})
