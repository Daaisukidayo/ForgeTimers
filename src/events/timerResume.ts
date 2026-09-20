import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerResume",
    version: "2.0.0",
    description: "Triggered when a timer on hold is started again",
    listener(environment) {
        runCommands(this, "timerResume", environment)
    },
})
