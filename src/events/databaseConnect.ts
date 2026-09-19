import { TimerEventHandler, runCommands } from "../managers"

export default new TimerEventHandler({
    name: "databaseConnect",
    version: "2.0.0",
    description: "Triggered when the timer storage opens",
    listener(environment) {
        runCommands(this, "databaseConnect", environment)
    },
})
