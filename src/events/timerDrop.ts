import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timerDrop",
    version: "1.3.0",
    description:
        "Triggered when a stored timer is thrown away without running, with the reason in $eventData[dropReason]",
    listener(environment) {
        runCommands(this, "timerDrop", environment)
    },
})
