import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "timersReady",
    version: "2.0.0",
    description: "Triggered once startup has dealt with every stored timer",
    listener(environment) {
        runCommands(this, "timersReady", environment)
    },
})
