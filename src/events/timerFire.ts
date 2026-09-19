import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerFire",
    version: "1.3.0",
    description: "Triggered when a timer's code runs: a timeout going off, or an interval ticking",
    listener(environment) {
        runCommands(this, "timerFire", environment)
    },
})
