import { BaseCommandManager, BaseEventHandler, ForgeClient, Interpreter } from "@tryforge/forgescript"
import { ForgeTimers } from ".."
import { TimerContext } from "../structures"
import { Logger } from "../functions/logger"
import { ITimerEventPayload, ITimerEvents, TimerEventName } from "../types"

export const HANDLER = "ForgeTimersEvents"

export class TimerCommandManager extends BaseCommandManager<TimerEventName> {
    public handlerName = HANDLER
}

export class TimerEventHandler extends BaseEventHandler<ITimerEvents, TimerEventName> {
    public override register(client: ForgeClient) {
        client.getExtension(ForgeTimers, true).emitter.on(this.name, this.listener.bind(client))
    }
}

export function runCommands(client: ForgeClient, event: TimerEventName, payload: ITimerEventPayload) {
    const commands = client.getExtension(ForgeTimers, true).commands?.get(event) ?? []
    if (!commands.length) return

    const { timer, event: data } = payload

    for (const command of commands) {
        Interpreter.run(
            new TimerContext({
                client,
                command,
                data: command.compiled.code,
                obj: {},
                timer: timer ?? null,
                event: data ?? null,
            })
        ).catch(Logger.error)
    }
}
