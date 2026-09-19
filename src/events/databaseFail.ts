import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "databaseFail",
    version: "2.0.0",
    description: "Triggered when the timer storage could not be opened",
    listener(environment) {
        runCommands(this, "databaseFail", environment)
    },
})
