import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerFire",
    version: "1.3.0",
    description: "Triggered when a timer's code runs: a timeout going off, an interval ticking, or a cron coming round",
    listener(environment) {
        runCommands(this, "timerFire", environment)
    },
})
