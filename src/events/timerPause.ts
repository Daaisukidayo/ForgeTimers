import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerPause",
    version: "2.0.0",
    description: "Triggered when a timer is put on hold",
    listener(environment) {
        runCommands(this, "timerPause", environment)
    },
})
