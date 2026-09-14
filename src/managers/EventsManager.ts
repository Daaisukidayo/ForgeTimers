import { BaseCommandManager, BaseEventHandler, ForgeClient, Interpreter } from "@tryforge/forgescript"
import { ForgeTimers } from ".."
import { Logger } from "../functions/logger"
import { ITimerEvents, TimerEventName } from "../types"

export const HANDLER = "ForgeTimersEvents"

export class TimerCommandManager extends BaseCommandManager<TimerEventName> {
    public handlerName = HANDLER
}

export class TimerEventHandler extends BaseEventHandler<ITimerEvents, TimerEventName> {
    public override register(client: ForgeClient) {
        client.getExtension(ForgeTimers, true).emitter.on(this.name, this.listener.bind(client))
    }
}

export function runCommands(client: ForgeClient, event: TimerEventName, environment: Record<string, unknown>) {
    const commands = client.getExtension(ForgeTimers, true).commands?.get(event) ?? []

    for (const command of commands) {
        Interpreter.run({
            client,
            command,
            data: command.compiled.code,
            obj: {},
            environment,
        }).catch(Logger.error)
    }
}
